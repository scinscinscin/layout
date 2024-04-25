const defaultChars = "qwertyuiopasdfghjklzxcvbnm1234567890";
export const generateId = (len: number, chars = defaultChars) => {
  let ret = "";
  while (ret.length < len) ret += chars[Math.floor(Math.random() * chars.length)];
  return ret;
};
