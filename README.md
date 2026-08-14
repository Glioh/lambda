# Lambda

Lambda uses npm workspaces for its independently runnable web and API applications.

## Getting Started

Use Node.js 24 LTS, install dependencies, then start both applications:

```bash
npm install
npm run dev
```

Web runs at [http://localhost:3000](http://localhost:3000). API runs at
[http://localhost:4000](http://localhost:4000), with health available at
`GET /api/health`.

Run either application independently with `npm run dev:web` or `npm run dev:api`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
