import { createFileRoute } from "@tanstack/react-router";
import { FieldApp } from "@/components/survey/FieldApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ViaCampo — Levantamento de pavimentação e acessibilidade" },
      { name: "description", content: "Registre caixas-ralo, rampas, calçadas, piso tátil, meio-fio e asfalto com GPS, mesmo offline." },
      { property: "og:title", content: "ViaCampo — Levantamento de campo" },
      { property: "og:description", content: "Levantamento de campo por GPS para obras de pavimentação e acessibilidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldApp,
});
