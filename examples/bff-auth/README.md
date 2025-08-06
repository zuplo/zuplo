# Backend for Frontend (BFF) Authorization Sample

This is the source code from the sample discussed in the [Backend for Frontend (BFF) Authorization blog post](https://zuplo.com/blog/backend-for-frontend-authentication). 

## Setup

This sample uses an OAuth identity provider (tested with Auth0) and Upstash. In order to run the sample you will need to set the following environment variables either in your `.env` file if you are running locally or in the [Zuplo portal](https://zuplo.com/docs/articles/environment-variables#:~:text=Environment%20variables%20are%20key%2Dvalue,configuration%20files%20in%20your%20project.) if you are running there.

```
// Auth0 Environment Variables
// Create a Regular Web Application in Auth0
//https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps
AUTH0_URL=my-url.us.auth0.com
CLIENT_ID=
CLIENT_SECRET=

// Create an Upstash Redis Database
// https://upstash.com/docs/redis/overall/getstarted
UPSTASH_URL=
UPSTASH_TOKEN=
```

## Use this example locally

To develop with this example locally, you can create a new Zuplo project using our CLI

```bash
npx create-zuplo-api@latest my-api --example bff-auth
```
Then, in the project directory run the following commands:

```
npm install
npm run dev
```

