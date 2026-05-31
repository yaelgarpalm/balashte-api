import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const sslConfig = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

export const typeOrmConfig: TypeOrmModuleOptions = process.env.DATABASE_URL
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: sslConfig,
      autoLoadEntities: true,
      synchronize: false,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
      ssl: sslConfig,
      autoLoadEntities: true,
      synchronize: false,
    };
