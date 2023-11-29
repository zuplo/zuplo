# Proxy Firestore with Firebase User Credentials

This sample demonstrates how to expose Firestore documents through a REST API using the Zuplo [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite) and the [Firebase User Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-user-auth-inbound).

## 1/ Create Route

Create a route that uses the [URL Rewrite Handler](https://zuplo.com/docs/handlers/url-rewrite). The rewrite points to the [Firestore REST API](https://firebase.google.com/docs/firestore/reference/rest/).

In this example, a `POST` request will accept an `{name}` parameter in the URL and a body for a new document. This document will be scoped to the authenticated user. The request will be mapped to the Firestore REST API endpoint to [create a document](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/createDocument).

<Route path="/todos/{name}" method="post" />

## 2/ Add Authentication Policy

This demo uses a mock authentication policy that is a [custom policy](https://zuplo.com/docs/policies/custom-code-inbound). This policy just takes the value of the `user-id` header and sets the authenticated user to that value. A real API would use the [API Key](https://zuplo.com/docs/policies/api-key-inbound) or one of the [JWT policies](https://zuplo.com/docs/policies/open-id-jwt-auth-inbound) to authenticate the user.

<Policy name="set-user" />

## 3/ Add Policy

The [Firebase User Auth Policy](https://zuplo.com/docs/policies/upstream-firebase-user-auth-inbound) will create an token for the current user that will be added to the outgoing request's `Authorization` header. This token is scoped to a specific user so any Firebase rules that are in place will be enforced.

<Policy name="firebase-user-auth" />

## 4/ Set Environment Variables

There are two environment variables used in the sample:

- `SERVICE_ACCOUNT_JSON` - The Firebase Service Account token
- `FIREBASE_PROJECT` - The Firebase project ID
- `WEB_API_KEY` - The Firebase [web api key](https://firebase.google.com/docs/projects/api-keys)

## 5/ Call the API

The API can now be called to retrieve a document from Firestore.

```bash
curl -X POST https://API_URL/todos/my-doc-name
   -H "Content-Type: application/json"
   -H "Authorization: user123"
   -d '{"fields": { "name": { "stringValue": "my-list" } } }'
```

Response:

```json
{
  "name": "projects/project-demo-8/databases/(default)/documents/todos/user123/list1/U7HlIJnAJdKDJeaF8Bmn",
  "fields": {
    "name": {
      "stringValue": "my-list"
    }
  },
  "createTime": "2023-06-02T18:17:39.041624Z",
  "updateTime": "2023-06-02T18:17:39.041624Z"
}
```
