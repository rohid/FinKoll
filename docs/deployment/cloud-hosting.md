# Cloud Hosting

🌐 **English** · [Svenska](cloud-hosting.sv.md) · [Español](cloud-hosting.es.md)

FinKoll is a self-contained Docker Compose stack (encrypted SQLite, no external
database), so it runs anywhere you can run containers. This guide covers three
common paths — **Cloudflare**, **AWS**, and **Azure** — with security as the
first consideration at every step.

> **Read this first — the security baseline** applies to *every* option below.

## Security baseline (all providers)

FinKoll already encrypts its database at rest (AES-256), stores sessions in
`httpOnly` cookies, rate-limits and locks out repeated failed logins, and sets
HSTS/CSP. Your hosting choices should preserve that, not undermine it:

- **Never bake secrets into the image or commit them.** Provide
  `JWT_SECRET`, `DB_ENCRYPTION_KEY`, and `ADMIN_PASSWORD_HASH` via the provider's
  secrets manager (below), not a `.env` sitting on a public disk.
- **Expose only 443.** Block inbound 80 except for ACME, and never expose the
  backend (3001) or SSH to the world — use the provider's bastion/agent instead.
- **Terminate TLS at a trusted layer** (edge, load balancer, or Caddy) — see
  [TLS & Let's Encrypt](tls-letsencrypt.md).
- **Encrypt the volume** that holds `data/` (the DB + backups) and **ship
  backups off-box** to encrypted object storage.
- **Prefer not exposing the app publicly at all.** A VPN or Cloudflare
  Tunnel + Access keeps a single-household budget app off the open internet
  entirely — the most effective control here.
- **Keep the encryption key recoverable but private.** If you lose
  `DB_ENCRYPTION_KEY`, the database is unrecoverable; if it leaks, the data is
  exposed. Store it in a secrets manager with access logging.

---

## Cloudflare

The recommended, lowest-exposure path: a **Cloudflare Tunnel** connects your
server to Cloudflare's edge with an outbound-only connection — **no inbound ports
opened, no public IP exposed**. Cloudflare terminates TLS; you can layer
**Cloudflare Access** (Zero Trust SSO) in front of the login page.

1. Run FinKoll normally (it can even stay on plain HTTP internally — Cloudflare
   provides the public TLS).
2. Add a `cloudflared` container:

   ```yaml
   services:
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel run
       environment:
         - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
       networks:
         - internal
   ```

3. In the Cloudflare Zero Trust dashboard: create a tunnel, copy its token into
   `CLOUDFLARE_TUNNEL_TOKEN`, and route your hostname → `https://frontend:443`
   (or `http://frontend:80` if you drop internal TLS).
4. **Add an Access policy** (Zero Trust → Access → Applications) requiring your
   email / an identity provider. Now even reaching the login page requires
   passing Cloudflare Access first — defense in depth.

**Security wins:** no open inbound ports, DDoS protection and WAF at the edge,
optional SSO in front, and your origin IP stays hidden. If you instead use
Cloudflare as a normal proxy (orange-cloud) with an open origin, lock the origin
firewall to Cloudflare's IP ranges and use an [Origin CA cert](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).

---

## AWS

Run the Compose stack on a small **EC2** instance (or **Lightsail** for
simplicity). Terminate TLS with an **Application Load Balancer + ACM** cert, or
with Caddy on the instance.

**Provisioning**
- EC2 `t4g.small` (ARM/Graviton — cheap; the images build on ARM) with Amazon
  Linux 2023 or Ubuntu; install Docker + Compose plugin.
- Attach an **encrypted EBS** volume for `data/` (or enable default EBS
  encryption).

**Security**
- **Security groups:** allow 443 only, and only from the ALB's security group.
  Do **not** open 3001. Do **not** open 22 — use **SSM Session Manager** for
  shell access instead of SSH.
- **Secrets:** store `JWT_SECRET`, `DB_ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH` in
  **SSM Parameter Store (SecureString)** or **Secrets Manager**; inject them at
  container start via the instance role — never write a plaintext `.env` to disk.
- **TLS:** request a public cert in **ACM**, attach to the ALB (443 listener),
  and forward to the instance. The ALB is the only thing internet-facing.
- **Enforce IMDSv2**, disable the public IP if using a NAT + ALB, and turn on
  **CloudTrail** + VPC flow logs.
- **Backups:** sync `data/backups/` to an **S3 bucket with SSE-KMS** and Block
  Public Access on; lifecycle-expire old copies.

> For a minimal footprint, **Lightsail** (a single container/instance with a
> built-in load balancer + managed cert) is the least-effort AWS option and
> covers the same TLS/secret needs on a smaller surface.

---

## Azure

Run on an **Azure VM** (Ubuntu) with Docker, or use **Azure Container Instances**.
Terminate TLS with **Azure Front Door** / **Application Gateway** (managed cert)
or Caddy on the VM.

**Provisioning**
- `Standard_B2s`/`B2ats_v2` VM; install Docker + Compose. Use a **Premium SSD**
  data disk with **Azure Disk Encryption** (or platform-managed keys) for `data/`.

**Security**
- **Network Security Group:** inbound 443 only (from the Front Door/App Gateway
  service tag if you front it); deny 3001; **no public SSH** — use **Azure
  Bastion** or `az ssh`.
- **Secrets:** store the three secrets in **Azure Key Vault**; grant the VM a
  **managed identity** and pull them at start (e.g. via a small entrypoint or
  the Key Vault extension). No plaintext `.env` on disk.
- **TLS:** **Front Door** or **App Gateway** with a managed certificate; enable
  the **WAF** policy in front. Front Door also hides the origin.
- **Monitoring:** enable **Microsoft Defender for Cloud**, NSG flow logs, and
  diagnostic logs.
- **Backups:** copy `data/backups/` to a **Storage Account** with encryption +
  private access; consider Azure Backup on the disk.

---

## Comparison

| | Public exposure | TLS | Secrets | Best for |
| --- | --- | --- | --- | --- |
| **Cloudflare Tunnel + Access** | None (outbound only) | Edge (auto) | Env / tunnel token | Most setups — lowest risk |
| **AWS EC2 + ALB/ACM** | ALB only | ACM (managed) | SSM / Secrets Manager | AWS-native shops |
| **Azure VM + Front Door** | Front Door only | Managed | Key Vault | Azure-native shops |

For a single-household deployment, **Cloudflare Tunnel + Access** gives the best
security-to-effort ratio: nothing is exposed, TLS and renewals are automatic, and
you can require SSO before the app is even reachable.

See also: [TLS & Let's Encrypt](tls-letsencrypt.md) · [Updating](../../UPDATING.md).
