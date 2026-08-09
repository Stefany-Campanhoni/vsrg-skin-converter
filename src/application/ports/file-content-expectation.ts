export type FileContentExpectation =
  | { readonly state: "missing" }
  | { readonly state: "sha256"; readonly sha256: string }
