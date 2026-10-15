import { PayOS } from '@payos/node';
import { env } from '../../config/env.js';

let payosInstance: PayOS | null = null;

/**
 * Singleton instance của PayOS SDK Client
 */
export function getPayOSClient(): PayOS {
  if (!payosInstance) {
    if (!env.payosClientId || !env.payosApiKey || !env.payosChecksumKey) {
      throw new Error(
        'PayOS credentials (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY) are not configured in environment.',
      );
    }

    payosInstance = new PayOS({
      clientId: env.payosClientId,
      apiKey: env.payosApiKey,
      checksumKey: env.payosChecksumKey,
    });
  }

  return payosInstance;
}
