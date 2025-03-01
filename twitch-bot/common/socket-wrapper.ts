import { Packet } from './packets';

type GenericSocket = { emit: (pId: string, ...args: any[]) => void; on: (pId: string, h: () => void) => void; off: (pId: string, h: () => void) => void; once: (pId: string, h: () => void) => void };

export default class SocketWrapper<S extends GenericSocket> {
  private socket: S;
  constructor(socket: S) {
    this.socket = socket;
  }
  public emit<T extends Packet>(type: { new (): T }, packet?: T) {
    if (!('getName' in type)) throw new Error(`Packet '${type.name}' missing getName function.`);
    const packetName = (type as unknown as { getName: () => string }).getName();
    if (packet) {
      this.socket.emit(packetName, packet);
    } else {
      this.socket.emit(packetName);
    }
  }
  public on<T extends Packet>(type: { new (): T }, handler: (packet?: T) => void) {
    if (!('getName' in type)) throw new Error(`Packet '${type.name}' missing getName function.`);
    const packetName = (type as unknown as { getName: () => string }).getName();
    this.socket.on(packetName, handler);
  }
  public off<T extends Packet>(type: { new (): T }, handler: (packet?: T) => void) {
    if (!('getName' in type)) throw new Error(`Packet '${type.name}' missing getName function.`);
    const packetName = (type as unknown as { getName: () => string }).getName();
    this.socket.off(packetName, handler);
  }
  public once<T extends Packet>(type: { new (): T }, handler: (packet?: T) => void) {
    if (!('getName' in type)) throw new Error(`Packet '${type.name}' missing getName function.`);
    const packetName = (type as unknown as { getName: () => string }).getName();
    this.socket.once(packetName, handler);
  }
}
