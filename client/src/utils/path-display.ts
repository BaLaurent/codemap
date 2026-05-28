export function cwdShort(cwd: string): string {
  return cwd.split('/').slice(-2).join('/');
}
