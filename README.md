# BERNINA One-Use Activation Generator

Static GitHub Pages frontend for generating one-use Bianco activation QR codes.

The page sends the password and selected dates to the Cloudflare Worker:

```text
https://bernina-activation.kaushikmanian456.workers.dev
```

Generated QR codes start with `BIANCO1.`. The iPad app redeems the code through the Worker, and the Worker locks the code to the first device ID that redeems it.

## Deployment

Serve the repository root with GitHub Pages. No Node server is required for the published website.

The Cloudflare Worker must include the `/activation-codes/from-password` endpoint before this static site can generate codes.
