// Wrapper sobre @node-rs/bcrypt (implementación Rust vía napi-rs, con binarios
// prebuilt para linux musl → funciona en la imagen Alpine sin build tools).
//
// Por qué NO bcryptjs: bcryptjs es JS puro y su hash/compare (cost 12) consume
// ~200-300ms de CPU EN EL EVENT LOOP por operación, serializando el servidor
// bajo concurrencia de logins. @node-rs/bcrypt corre en el threadpool de libuv
// → no bloquea el hilo principal.
//
// Compatibilidad: es el mismo algoritmo bcrypt; los hashes existentes creados
// por bcryptjs ($2a$/$2b$) siguen verificando (probado en ambos sentidos), así
// que la migración no invalida ninguna contraseña.
import { hash as nodeHash, verify as nodeVerify } from "@node-rs/bcrypt";

export const bcrypt = {
  hash: (data: string, rounds: number): Promise<string> => nodeHash(data, rounds),
  compare: (data: string, hash: string): Promise<boolean> => nodeVerify(data, hash),
};
