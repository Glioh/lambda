/** Recursive file-tree node: file name or directory tuple with descendants. */
export type TreeItem = string | [string, ...TreeItem[]];
