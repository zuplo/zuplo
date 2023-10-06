# Log Request & Response

This sample shows how to add logging for every request that captures the full request and response in order to send to your log provider.

This example uses the [OnResponseSendingFinal](https://zuplo.com/docs/articles/runtime-extensions#hook-context-onresponsesendingfinal) hook in the `zuplo.runtime.ts` file to register a global log event.
