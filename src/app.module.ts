import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { ProductosModule } from './modules/productos/productos.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ProveedoresModule } from './modules/proveedores/proveedores.module';
import { CategoriasModule } from './modules/categorias/categorias.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { BeneficiosModule } from './modules/beneficios/beneficios.module';
import { CajaModule } from './modules/caja/caja.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { ApartadosModule } from './modules/apartados/apartados.module';
import { ComprasModule } from './modules/compras/compras.module';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { FacturapiModule } from './modules/facturapi/facturapi.module';
import { RespaldosModule } from './modules/respaldos/respaldos.module';
import { typeOrmConfig } from './database/typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig),
    AuthModule,
    ProductosModule,
    VentasModule,
    ClientesModule,
    ProveedoresModule,
    CategoriasModule,
    UsuariosModule,
    BeneficiosModule,
    CajaModule,
    GastosModule,
    ApartadosModule,
    ComprasModule,
    ConfiguracionModule,
    ReportesModule,
    StripeModule,
    FacturapiModule,
    RespaldosModule,
  ],
  controllers: [HealthController],
  providers: [AuthGuard, RolesGuard],
})
export class AppModule {}
