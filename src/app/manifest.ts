import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Radar de Influencers · Libertario",
    short_name: "Radar Libertario",
    description: "Micro-influencers de café y brunch para Libertario Coffee Roasters.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6efe4",
    theme_color: "#7a3a22",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
