function escapeMDV2(s: string) {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
export { escapeMDV2 };