export default function token(len = 33) {
  const chars = "abcdefghijklmnopqrstuvwxyz1234567890-.";
  let ret = "";

  for (let i = 0; i < len; i++) {
    ret += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return ret;
}
