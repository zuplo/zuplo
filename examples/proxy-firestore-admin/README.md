# Proxy Firestore with Firebase Admin Credentials

This sample demonstrates how to expose Firestore documents through a REST API using the Zuplo [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite) and the [Firebase Admin Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-admin-auth-inbound).

## 1/ Create Route

Create a route that uses the [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite). The rewrite points to the [Firestore REST API](https://firebase.google.com/docs/firestore/reference/rest/).

In this example, a `GET` request will retrieve a single document by by mapping the `id` parameter of the incoming request to the Firestore REST API endpoint to [GET a document](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/get)

<Route path="/doc/{id}" method="get" />

## 2/ Add Policy

The [Firebase Admin Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-admin-auth-inbound) will create an admin token using a Firebase Service Account that will be added to the outgoing request's `Authorization` header. Because this token will allow full access to any document, generally another authorization policy would also be applied.

<Policy name="upstream-firebase-admin" />

## 3/ Set Environment Variables

There are two environment variables used in the sample:

- `SERVICE_ACCOUNT_JSON` - The Firebase Service Account token
- `FIREBASE_PROJECT` - The Firebase project ID

## 3/ Call the API

The API can now be called to retrieve a document from Firestore.

```bash
curl https://API_URL/doc/{id}
```

Response:

```json
{
  "name": "projects/project-demo-8/databases/(default)/documents/products/24uBKfjOkDvNv1mjrEpL",
  "fields": {
    "name": {
      "stringValue": "hammer"
    },
    "description": {
      "stringValue": "A normal hammer"
    },
    "price": {
      "stringValue": "14.99"
    }
  },
  "createTime": "2023-05-23T11:38:29.109118Z",
  "updateTime": "2023-05-23T11:38:29.109118Z"
}
```
