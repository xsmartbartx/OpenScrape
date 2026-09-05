import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });
  app.setGlobalPrefix('api/v1');
  const allowedOrigin = process.env.APP_URL ?? 'http://localhost:3000';
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
      callback(null, !origin || origin === allowedOrigin),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
