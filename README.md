# BERNINA One-Use Activation Generator

Static GitHub Pages frontend for generating Bianco activation QR codes with a configurable device limit.

The page sends the password and selected dates to the Cloudflare Worker:

```text
https://bernina-activation.kaushikmanian456.workers.dev
```

Generated QR codes start with `BIANCO1.`. The iPad app redeems the code through the Worker, and the Worker locks the code after the configured number of unique device IDs redeem it.

## Deployment

Serve the repository root with GitHub Pages. No Node server is required for the published website.

The Cloudflare Worker in `worker/` must be deployed before this static site can generate codes:

```sh
cd worker
npm install
npx wrangler deploy
```

Required Worker secrets:

```text
ADMIN_TOKEN
LICENSE_PASSWORD
```

The published frontend never stores the admin token. It sends the password to `/activation-codes/from-password`, and the Worker creates the one-use code.
