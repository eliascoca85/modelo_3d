import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      {
        // .opus va dentro de un contenedor OGG. Servirlo con el MIME correcto
        // (audio/ogg + codec opus) garantiza que `decodeAudioData` lo acepte en
        // todos los navegadores — sin esto Next lo entrega como
        // `application/octet-stream`, que algunos motores (p. ej. Safari) rechazan
        // decodificar por tipo.
        source: "/music/:path*.opus",
        headers: [
          { key: "Content-Type", value: "audio/ogg; codecs=opus" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
