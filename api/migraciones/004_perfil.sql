-- Perfil: texto «sobre ti», empresa o equipo y foto de perfil (avatar_v sube con cada foto nueva; 0 = sin foto).
-- La foto va al volumen de archivos (_avatares/<usuario>.webp|png|jpg), aquí solo la versión para invalidar la caché.
ALTER TABLE usuarios ADD COLUMN bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 280);
ALTER TABLE usuarios ADD COLUMN empresa text NOT NULL DEFAULT '' CHECK (length(empresa) <= 80);
ALTER TABLE usuarios ADD COLUMN avatar_v integer NOT NULL DEFAULT 0;
