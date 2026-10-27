import { describe, expect, it } from "vitest";
import { apa, delatex, inText, parseBibtex, parseNames, sortRefs, toRef } from "./bibtex";

const BIB = String.raw`
% Diekspor dari Zotero
@string{acl = "Association for Computational Linguistics"}
@comment{ ini komentar {bersarang} }
@inproceedings{devlin2019bert,
  title = {{BERT}: Pre-training of Deep Bidirectional Transformers for Language Understanding},
  author = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},
  booktitle = {Proceedings of NAACL-HLT},
  pages = {4171--4186},
  year = 2019,
  publisher = acl,
  doi = {10.18653/v1/N19-1423},
  keywords = {transformer, pretraining},
  abstract = {We introduce a new language representation model called {BERT}.}
}
@article{wilie2020indonlu,
  title = "IndoNLU: Benchmark and Resources for Evaluating {I}ndonesian Natural Language Understanding",
  author = "Bryan Wilie and Karissa Vincentio and Genta Indra Winata",
  journal = {arXiv preprint},
  volume = "2009",
  number = {05387},
  year = {2020},
  url = {https://arxiv.org/abs/2009.05387}
}
@book{garcia2010,
  author = {Garc{\'\i}a M{\"u}ller, Jos\'{e} and {Badan Pusat Statistik}},
  title = {Statistik \& Data},
  year = {2010},
  publisher = {Gramedia}
}
@misc{rusak
`;

describe("BibTeX", () => {
  const entries = parseBibtex(BIB);

  it("membaca entri, @string, dan melewati yang rusak", () => {
    expect(entries.map((e) => e.key)).toEqual(["devlin2019bert", "wilie2020indonlu", "garcia2010"]);
    expect(entries[0].fields.publisher).toBe("Association for Computational Linguistics");
    expect(entries[0].fields.year).toBe("2019");
    expect(entries[1].fields.title).toContain("{I}ndonesian");
  });

  it("membersihkan LaTeX", () => {
    expect(delatex("{BERT}: Pre-training -- \\emph{deep} M{\\\"u}ller \\& co.")).toBe("BERT: Pre-training – deep Müller & co.");
  });

  it("nama: format koma, nama depan dulu, dan lembaga", () => {
    expect(parseNames("Devlin, Jacob and Ming-Wei Chang")).toEqual([
      { last: "Devlin", first: "Jacob" },
      { last: "Chang", first: "Ming-Wei" },
    ]);
    expect(parseNames("Ludwig van Beethoven and {Badan Pusat Statistik}")).toEqual([
      { last: "van Beethoven", first: "Ludwig" },
      { last: "Badan Pusat Statistik", first: "" },
    ]);
  });

  it("sitasi APA dan dalam teks", () => {
    const r = toRef(entries[0]);
    expect(apa(r)).toBe("Devlin, J., Chang, M.-W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. Dalam *Proceedings of NAACL-HLT* (hlm. 4171–4186). https://doi.org/10.18653/v1/N19-1423");
    expect(inText(r)).toBe("(Devlin dkk., 2019)");
    expect(r.keywords).toEqual(["transformer", "pretraining"]);
    const a = toRef(entries[1]);
    expect(apa(a)).toContain("*arXiv preprint*, *2009*(05387). https://arxiv.org/abs/2009.05387");
    expect(inText(toRef(entries[2]))).toBe("(García Müller & Badan Pusat Statistik, 2010)");
  });

  it("urut menurut penulis pertama", () => {
    expect(sortRefs(entries.map(toRef)).map((r) => r.key)).toEqual(["devlin2019bert", "garcia2010", "wilie2020indonlu"]);
  });
});
