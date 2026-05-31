import { Module } from '@nestjs/common';
import { FacturapiController } from './facturapi.controller';
import { FacturapiService } from './facturapi.service';

@Module({ controllers: [FacturapiController], providers: [FacturapiService] })
export class FacturapiModule {}
