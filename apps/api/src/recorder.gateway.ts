import { Injectable } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { RecorderRuntimeService } from './recorder-runtime.service';

@Injectable()
@WebSocketGateway({ path: '/api/v1/recorder' })
export class RecorderGateway {
  constructor(private readonly runtime: RecorderRuntimeService) {}

  handleConnection(client: WebSocket): void {
    this.runtime.register(client);
  }

  handleDisconnect(client: WebSocket): void {
    this.runtime.unregister(client);
  }

  @SubscribeMessage('message')
  async handleMessage(client: WebSocket, message: unknown): Promise<void> {
    await this.runtime.handleMessage(client, message);
  }
}