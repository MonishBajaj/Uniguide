import { Fragment, type ReactNode } from "react";

/** Puts a node (such as a glossary Term) where "{term}" sits in a translated sentence. */
export function withTerm(text: string, term: ReactNode): ReactNode {
  const [before, after] = text.split("{term}");
  return (
    <Fragment>
      {before}
      {term}
      {after}
    </Fragment>
  );
}
