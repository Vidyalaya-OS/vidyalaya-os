// Who to contact about Vidyalaya OS (the same as web/src/lib/contact.ts).

export const CONTACT = {
  productOwner: "Avnish",
  email: "tech.kisan.gamer@gmail.com",
  /** Digits only, with the country code, for tel: and WhatsApp links. */
  phone: "+917700801472",
  /** How the number is written on screen. */
  phoneLabel: "+91 77008 01472",
} as const;

export const contactLinks = {
  email: `mailto:${CONTACT.email}`,
  phone: `tel:${CONTACT.phone}`,
};
