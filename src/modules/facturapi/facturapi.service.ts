import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

declare const require: any;
const Facturapi = require('facturapi').default;

@Injectable()
export class FacturapiService {
  private facturapi: any;

  constructor(private readonly dataSource: DataSource) {}

  async crearFactura(req: any, res: any) {
    const { venta_id, uso_cfdi } = req.body;

    if (!venta_id) {
      return res.status(400).json({ ok: false, mensaje: 'El ID de la venta es obligatorio.' });
    }

    try {
      const [venta] = await this.dataSource.query(
        `SELECT
          v.*,
          c.id AS cliente_id,
          c.nombre AS cliente_nombre,
          c.email AS cliente_email,
          c.rfc,
          c.facturapi_id,
          c.regimen_fiscal,
          c.codigo_postal
        FROM ventas v
        JOIN clientes c ON v.cliente_id = c.id
        WHERE v.id = ?`,
        [venta_id],
      );

      if (!venta) {
        return res.status(404).json({ ok: false, mensaje: 'Venta no encontrada' });
      }
      if (venta.factura_id) {
        return res.status(400).json({ ok: false, mensaje: 'Esta venta ya tiene una factura asociada.' });
      }
      if (venta.estado !== 'completada') {
        return res.status(400).json({ ok: false, mensaje: 'Solo se pueden facturar ventas completadas.' });
      }
      if (!venta.rfc || venta.rfc === 'XAXX010101000') {
        return res.status(400).json({ ok: false, mensaje: 'El cliente debe tener un RFC válido para facturar.' });
      }

      const detalle = await this.dataSource.query(
        `SELECT dv.*, p.nombre AS producto_nombre, p.codigo_sat, p.unidad_sat
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        WHERE dv.venta_id = ?`,
        [venta_id],
      );

      if (!detalle.length) {
        return res.status(400).json({ ok: false, mensaje: 'La venta no tiene productos asociados.' });
      }

      let facturapiCustomerId = venta.facturapi_id;
      if (!facturapiCustomerId) {
        const customer = await this.sincronizarCliente(venta.cliente_id);
        facturapiCustomerId = customer.id;
      }

      const items = detalle.map((item) => ({
        quantity: item.cantidad,
        product: {
          description: item.producto_nombre,
          product_key: item.codigo_sat || '01010101',
          price: Number(item.precio_unitario),
          tax_included: false,
          taxes: [{ type: 'IVA', rate: 0.16 }],
        },
      }));

      const invoice = await this.getFacturapi().invoices.create({
        customer: facturapiCustomerId,
        items,
        payment_form: this.mapearFormaPago(venta.metodo_pago),
        payment_method: 'PUE',
        use: uso_cfdi || 'G03',
        series: 'F',
        currency: 'MXN',
      });

      const dashboardUrl = `https://dashboard.facturapi.io/invoices/${invoice.id}`;
      const pdfUrl = `https://www.facturapi.io/v2/invoices/${invoice.id}/pdf`;
      const xmlUrl = `https://www.facturapi.io/v2/invoices/${invoice.id}/xml`;

      await this.dataSource.query('UPDATE ventas SET factura_id = ?, factura_url = ? WHERE id = ?', [
        invoice.id,
        dashboardUrl,
        venta_id,
      ]);

      return res.json({
        ok: true,
        mensaje: 'Factura creada exitosamente',
        factura: {
          id: invoice.id,
          status: invoice.status,
          total: invoice.total,
          uuid: invoice.uuid,
          series: invoice.series,
          folio_number: invoice.folio_number,
          stamp: invoice.stamp,
          dashboardUrl,
          pdfUrl,
          xmlUrl,
        },
      });
    } catch (error) {
      console.error('[Facturapi] Error al crear factura:', error.message);
      return res.status(500).json({
        ok: false,
        mensaje: error.message || 'Error al procesar la factura con Facturapi',
      });
    }
  }

  async descargarPdf(req: any, res: any) {
    const { factura_id } = req.params;

    try {
      const pdfStream = await this.getFacturapi().invoices.downloadPdf(factura_id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=factura-${factura_id}.pdf`);
      return pdfStream.pipe(res);
    } catch (error) {
      console.error('[Facturapi] Error descargando PDF:', error.message);
      return res.status(500).json({ ok: false, mensaje: 'Error al descargar el PDF de la factura.' });
    }
  }

  async descargarXml(req: any, res: any) {
    const { factura_id } = req.params;

    try {
      const xmlStream = await this.getFacturapi().invoices.downloadXml(factura_id);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename=factura-${factura_id}.xml`);
      return xmlStream.pipe(res);
    } catch (error) {
      console.error('[Facturapi] Error descargando XML:', error.message);
      return res.status(500).json({ ok: false, mensaje: 'Error al descargar el XML de la factura.' });
    }
  }

  async enviarEmail(req: any, res: any) {
    const { factura_id } = req.params;
    const { email } = req.body;

    try {
      await this.getFacturapi().invoices.sendByEmail(factura_id, { email });
      return res.json({ ok: true, mensaje: `Factura enviada a ${email}` });
    } catch (error) {
      console.error('[Facturapi] Error enviando email:', error.message);
      return res.status(500).json({ ok: false, mensaje: 'Error al enviar la factura por email.' });
    }
  }

  async cancelar(req: any, res: any) {
    const { factura_id } = req.params;
    const { motive } = req.body;

    try {
      const resultado = await this.getFacturapi().invoices.cancel(factura_id, { motive: motive || '02' });
      await this.dataSource.query('UPDATE ventas SET factura_id = NULL, factura_url = NULL WHERE factura_id = ?', [
        factura_id,
      ]);

      return res.json({ ok: true, mensaje: 'Factura cancelada', resultado });
    } catch (error) {
      console.error('[Facturapi] Error cancelando factura:', error.message);
      return res.status(500).json({ ok: false, mensaje: error.message || 'Error al cancelar la factura.' });
    }
  }

  private async sincronizarCliente(clienteId: number) {
    const [cliente] = await this.dataSource.query('SELECT * FROM clientes WHERE id = ?', [clienteId]);

    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }
    if (!cliente.rfc || cliente.rfc === 'XAXX010101000') {
      throw new Error('El cliente debe tener un RFC válido para facturar.');
    }

    const customerData = {
      legal_name: cliente.nombre,
      tax_id: cliente.rfc,
      tax_system: cliente.regimen_fiscal || '601',
      email: cliente.email || 'sin-email@example.com',
      address: { zip: cliente.codigo_postal || '06600' },
    };

    try {
      if (cliente.facturapi_id) {
        try {
          return await this.getFacturapi().customers.update(cliente.facturapi_id, customerData);
        } catch (_error) {
          const created = await this.getFacturapi().customers.create(customerData);
          await this.dataSource.query('UPDATE clientes SET facturapi_id = ? WHERE id = ?', [created.id, clienteId]);
          return created;
        }
      }

      const created = await this.getFacturapi().customers.create(customerData);
      await this.dataSource.query('UPDATE clientes SET facturapi_id = ? WHERE id = ?', [created.id, clienteId]);
      return created;
    } catch (error) {
      throw new Error(`Error al sincronizar cliente con Facturapi: ${error.message}`);
    }
  }

  private getFacturapi() {
    if (this.facturapi) {
      return this.facturapi;
    }

    const key = process.env.FACTURAPI_KEY;
    if (!key) {
      throw new Error('FACTURAPI_KEY no está definida en el archivo .env');
    }

    this.facturapi = new Facturapi(key);
    return this.facturapi;
  }

  private mapearFormaPago(metodo?: string) {
    const mapas = {
      efectivo: '01',
      tarjeta: '04',
      transferencia: '03',
      debito: '28',
      mixto: '99',
    };

    return mapas[(metodo || 'efectivo').toLowerCase()] || '01';
  }
}
