import { EventEmitter } from 'node:events';
import dbus from 'dbus-next';
import type { Notification } from './protocol.js';

const { Interface } = (dbus as any).interface;

/**
 * org.freedesktop.Notifications daemon on the session's private bus, so
 * notify-send, browsers, mail clients etc. pop up in the 3D UI.
 *
 * Events: 'notify' (n: Notification), 'close' (id)
 */
export class NotificationDaemon extends EventEmitter {
  private bus: any;
  private iface: any;
  private nextId = 1;

  async start(address: string) {
    this.bus = (dbus as any).sessionBus({ busAddress: address });
    const daemon = this;

    class Iface extends Interface {
      GetCapabilities() { return ['body', 'actions', 'persistence', 'icon-static']; }
      GetServerInformation() { return ['Diorama', 'diorama', '0.1', '1.2']; }
      Notify(app: string, replacesId: number, icon: string, summary: string, body: string,
        actions: string[], hints: Record<string, any>, timeout: number) {
        const id = replacesId || daemon.nextId++;
        const pairs: { key: string; label: string }[] = [];
        for (let i = 0; i + 1 < actions.length; i += 2) pairs.push({ key: actions[i], label: actions[i + 1] });
        const urgency = Number(hints?.urgency?.value ?? 1) as 0 | 1 | 2;
        daemon.emit('notify', {
          id, app, summary, body, icon: icon || undefined, urgency, timeout, actions: pairs,
        } satisfies Notification);
        return id;
      }
      CloseNotification(id: number) {
        daemon.closed(id, 3);
      }
      NotificationClosed(_id: number, _reason: number) { return [_id, _reason]; }
      ActionInvoked(_id: number, _key: string) { return [_id, _key]; }
    }
    Iface.configureMembers({
      methods: {
        GetCapabilities: { inSignature: '', outSignature: 'as' },
        GetServerInformation: { inSignature: '', outSignature: 'ssss' },
        Notify: { inSignature: 'susssasa{sv}i', outSignature: 'u' },
        CloseNotification: { inSignature: 'u', outSignature: '' },
      },
      signals: {
        NotificationClosed: { signature: 'uu' },
        ActionInvoked: { signature: 'us' },
      },
    });
    this.iface = new (Iface as any)('org.freedesktop.Notifications');
    await this.bus.requestName('org.freedesktop.Notifications', 0);
    this.bus.export('/org/freedesktop/Notifications', this.iface);
  }

  /** reason: 1 expired, 2 dismissed by user, 3 closed by app */
  closed(id: number, reason: 1 | 2 | 3) {
    this.iface?.NotificationClosed(id, reason);
    this.emit('close', id);
  }

  invoke(id: number, key: string) {
    this.iface?.ActionInvoked(id, key);
    this.closed(id, 2);
  }

  stop() {
    this.bus?.disconnect();
  }
}
