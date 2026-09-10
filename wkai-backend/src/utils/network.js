import os from "os";

const VIRTUAL_ADAPTER = /tailscale|virtualbox|vmware|hyper-v|vethernet|wsl|docker|loopback|bluetooth/i;

/**
 * The address a student on the same wifi can actually reach.
 *
 * This used to return the first non-internal IPv4 in enumeration order, which
 * on a machine running Tailscale is a 169.254 link-local address — routable to
 * nobody. Every join link and LAN hint built on it was dead on arrival, and the
 * failure looks like the app being broken rather than the wrong NIC being
 * picked. Rank instead: real private LAN ranges first, virtual adapters last,
 * link-local never.
 */
function getLocalIp() {
  const candidates = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const iface of addresses ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      // 169.254/16 is what an interface assigns itself when it has no real
      // address. It is never reachable from another machine.
      if (iface.address.startsWith('169.254.')) continue;

      const isPrivate =
        iface.address.startsWith('192.168.') ||
        iface.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(iface.address);

      candidates.push({
        address: iface.address,
        // Lower sorts first: a real LAN address on a real adapter wins.
        rank: (isPrivate ? 0 : 2) + (VIRTUAL_ADAPTER.test(name) ? 1 : 0),
      });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? null;
}

export { getLocalIp };
