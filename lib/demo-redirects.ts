export type RedirectDestination = {
  name: string;
  target: string;
};

const whatsappMessage = encodeURIComponent(
  "Hola MILANGA, vi el folleto y quiero hacer un pedido."
);

export const demoRedirects: Record<string, RedirectDestination> = {
  "milanga-folleto": {
    name: "Folleto A6 — Septiembre",
    target: `https://wa.me/5493794141903?text=${whatsappMessage}`,
  },
  "iman-heladera": {
    name: "Imán heladera",
    target: `https://wa.me/5493794141903?text=${encodeURIComponent("Hola MILANGA, vi el imán y quiero hacer un pedido.")}`,
  },
  packaging: {
    name: "Packaging principal",
    target: `https://wa.me/5493794141903?text=${encodeURIComponent("Hola MILANGA, escaneé el QR del packaging y quiero hacer un pedido.")}`,
  },
};
