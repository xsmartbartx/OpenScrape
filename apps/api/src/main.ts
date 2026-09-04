import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const allowedOrigin = process.env.APP_URL ?? 'http://localhost:3000';
  app.enableCors({ origin: allowedOrigin, credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
