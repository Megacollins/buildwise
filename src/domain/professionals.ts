/** Professional categories. Keep in sync with the ProfessionalCategory enum in prisma/schema.prisma. */
export const PRO_CATEGORIES = [
  ["ARCHITECT", "Architect", "Develops the concept into detailed, compliant architectural drawings."],
  ["STRUCTURAL_ENGINEER", "Structural engineer", "Designs foundations, frame and slabs so the house stands safely."],
  ["MEP_ENGINEER", "MEP engineer", "Designs electrical, plumbing and ventilation systems."],
  ["QUANTITY_SURVEYOR", "Quantity surveyor", "Prices the design accurately with local market rates."],
  ["CONTRACTOR", "Contractor", "Builds the project and manages the site."],
  ["INTERIOR_DESIGNER", "Interior designer", "Plans interiors, finishes and furniture."],
  ["BUILDER", "Builder", "Smaller-scale construction and trades."],
] as const;
