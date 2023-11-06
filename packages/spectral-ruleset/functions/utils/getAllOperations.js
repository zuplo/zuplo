import { isPlainObject } from "@stoplight/json";
const validOperationKeys = [
    "get",
    "head",
    "post",
    "put",
    "patch",
    "delete",
    "options",
    "trace",
];
export function* getAllOperations(paths) {
    if (!isPlainObject(paths)) {
        return;
    }
    const item = {
        path: "",
        operation: "",
        value: null,
    };
    for (const path of Object.keys(paths)) {
        const operations = paths[path];
        if (!isPlainObject(operations)) {
            continue;
        }
        item.path = path;
        for (const operation of Object.keys(operations)) {
            if (!isPlainObject(operations[operation]) ||
                !validOperationKeys.includes(operation)) {
                continue;
            }
            item.operation = operation;
            item.value = operations[operation];
            yield item;
        }
    }
}
