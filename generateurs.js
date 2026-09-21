/* ==========================================================================
   Générateurs de questions — banque sans fin
   Chaque chapitre expose des modèles de questions tirés au sort et paramétrés
   au hasard : les énoncés ne se répètent pas, et les mauvaises réponses sont
   calculées à partir des erreurs classiques plutôt que tirées n'importe où.
   ========================================================================== */

const Alea = {
  entier(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); },
  choix(tableau) { return tableau[Math.floor(Math.random() * tableau.length)]; },
  signe() { return Math.random() < 0.5 ? -1 : 1; },
  melanger(tableau) {
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  },
};

/* ————— Mise en forme ————————————————————————————————————————— */

const EXPOSANTS = { 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶" };
const INDICES = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅" };

/** Terme polynomial lisible : 3x², -x, 5 … */
function terme(coef, exposant) {
  if (coef === 0) return "";
  if (exposant === 0) return `${coef}`.replace("-", "−");
  const nombre = coef === 1 ? "" : coef === -1 ? "−" : `${coef}`.replace("-", "−");
  const puissance = exposant === 1 ? "x" : `x${EXPOSANTS[exposant] || "^" + exposant}`;
  return `${nombre}${puissance}`;
}

/** Assemble des termes en une expression : 3x² − 4x + 1 */
function polynome(termes) {
  const morceaux = termes.filter(Boolean);
  if (!morceaux.length) return "0";
  return morceaux.reduce((texte, morceau) => {
    if (!texte) return morceau;
    return morceau.startsWith("−") ? `${texte} − ${morceau.slice(1)}` : `${texte} + ${morceau}`;
  }, "");
}

function pgcd(a, b) { return b === 0 ? Math.abs(a) : pgcd(b, a % b); }

/** Fraction réduite, affichée sans dénominateur quand il vaut 1. */
function fraction(numerateur, denominateur) {
  const d = pgcd(numerateur, denominateur) || 1;
  const n = numerateur / d;
  const q = denominateur / d;
  return q === 1 ? `${n}` : `${n}/${q}`;
}

/**
 * Fabrique des propositions fausses, toutes différentes de la bonne réponse.
 * `secours` complète si les erreurs classiques ne suffisent pas.
 */
function fausses(bonne, candidats, secours) {
  const vues = new Set([String(bonne)]);
  const retenues = [];

  candidats.forEach((candidat) => {
    const texte = String(candidat);
    if (retenues.length < 3 && !vues.has(texte)) { vues.add(texte); retenues.push(texte); }
  });

  let garde = 0;
  while (retenues.length < 3 && garde++ < 80) {
    const texte = String(secours());
    if (!vues.has(texte)) { vues.add(texte); retenues.push(texte); }
  }
  return retenues;
}

/** Remplace le tiret ASCII par un vrai signe moins devant les nombres. */
function joliMoins(texte) { return String(texte).replace(/-(?=\d)/g, "−"); }

/** Un facteur négatif se met entre parenthèses : 3×(−2) et non 3×−2. */
function facteur(x) { return x < 0 ? `(${joliMoins(x)})` : `${x}`; }

/** Question à quatre choix ; la bonne réponse est en tête, l'ordre est mélangé à l'affichage. */
function qcm(enonce, bonne, propositionsFausses, explication) {
  return {
    q: joliMoins(enonce),
    choix: [bonne, ...propositionsFausses].map(joliMoins),
    bonne: 0,
    explication: joliMoins(explication),
  };
}

/* ————— Questions construites à partir d'une table de faits ——————— */

/** Table { annee, evenement } → questions date ↔ événement. */
function questionsDatees(faits) {
  return [
    () => {
      const fait = Alea.choix(faits);
      const autres = faits.filter((f) => f.annee !== fait.annee);
      return qcm(
        `En quelle année : ${fait.evenement} ?`,
        fait.annee,
        fausses(fait.annee, Alea.melanger(autres).slice(0, 3).map((f) => f.annee),
          () => fait.annee + Alea.signe() * Alea.entier(1, 9)),
        `${fait.annee} — ${fait.evenement}.`
      );
    },
    () => {
      const fait = Alea.choix(faits);
      const autres = Alea.melanger(faits.filter((f) => f.evenement !== fait.evenement));
      return qcm(
        `Quel événement correspond à l'année ${fait.annee} ?`,
        fait.evenement,
        fausses(fait.evenement, autres.slice(0, 3).map((f) => f.evenement), () => Alea.choix(autres).evenement),
        `En ${fait.annee} : ${fait.evenement}.`
      );
    },
    () => {
      const [a, b] = Alea.melanger(faits).slice(0, 2);
      const premier = a.annee < b.annee ? a : b;
      const second = a.annee < b.annee ? b : a;
      const autres = Alea.melanger(faits.filter((f) => f !== premier));
      return qcm(
        `Lequel de ces événements est le plus ancien ?`,
        premier.evenement,
        fausses(premier.evenement, [second.evenement, ...autres.slice(0, 2).map((f) => f.evenement)],
          () => Alea.choix(autres).evenement),
        `${premier.evenement} (${premier.annee}) précède ${second.evenement} (${second.annee}).`
      );
    },
  ];
}

/** Majuscule initiale, pour réutiliser une définition en début de phrase. */
function majuscule(texte) { return texte.charAt(0).toUpperCase() + texte.slice(1); }

/** Table { terme, definition } avec des définitions déclaratives. */
function questionsNotions(notions) {
  return [
    () => {
      const notion = Alea.choix(notions);
      const autres = Alea.melanger(notions.filter((n) => n.terme !== notion.terme));
      return qcm(
        `Quelle notion correspond à : ${notion.definition} ?`,
        notion.terme,
        fausses(notion.terme, autres.slice(0, 3).map((n) => n.terme), () => Alea.choix(autres).terme),
        `${notion.terme} : ${notion.definition}.`
      );
    },
    () => {
      const notion = Alea.choix(notions);
      const autres = Alea.melanger(notions.filter((n) => n.terme !== notion.terme));
      return qcm(
        `Que désigne « ${notion.terme} » ?`,
        majuscule(notion.definition),
        fausses(majuscule(notion.definition), autres.slice(0, 3).map((n) => majuscule(n.definition)),
          () => majuscule(Alea.choix(autres).definition)),
        `${notion.terme} : ${notion.definition}.`
      );
    },
  ];
}

/** Table { auteur, these } → questions auteur ↔ thèse. */
function questionsAuteurs(auteurs) {
  return [
    () => {
      const fiche = Alea.choix(auteurs);
      const autres = Alea.melanger(auteurs.filter((a) => a.auteur !== fiche.auteur));
      return qcm(
        `Quel philosophe soutient que ${fiche.these} ?`,
        fiche.auteur,
        fausses(fiche.auteur, autres.slice(0, 3).map((a) => a.auteur), () => Alea.choix(autres).auteur),
        `${fiche.auteur} : ${fiche.these}.`
      );
    },
    () => {
      const fiche = Alea.choix(auteurs);
      const autres = Alea.melanger(auteurs.filter((a) => a.auteur !== fiche.auteur));
      return qcm(
        `Quelle thèse est celle de ${fiche.auteur} ?`,
        majuscule(fiche.these),
        fausses(majuscule(fiche.these), autres.slice(0, 3).map((a) => majuscule(a.these)),
          () => majuscule(Alea.choix(autres).these)),
        `${fiche.auteur} : ${fiche.these}.`
      );
    },
  ];
}

/* ————— Générateurs par chapitre ——————————————————————————————— */

const GENERATEURS = {

  /* — Dérivées — */
  derivees: [
    () => {                                   // dérivée d'un polynôme
      const a = Alea.entier(2, 6) * Alea.signe();
      const n = Alea.entier(2, 4);
      const b = Alea.entier(1, 9) * Alea.signe();
      const enonce = `Quelle est la dérivée de f(x) = ${polynome([terme(a, n), terme(b, 1)])} ?`;
      const bonne = polynome([terme(a * n, n - 1), terme(b, 0)]);
      return qcm(enonce, bonne, fausses(bonne, [
        polynome([terme(n, n - 1), terme(b, 0)]),          // oubli du coefficient
        polynome([terme(a * n, n), terme(b, 0)]),          // exposant non abaissé
        polynome([terme(a * n, n - 1)]),                   // terme constant oublié
      ], () => polynome([terme(a * n + Alea.entier(1, 3), n - 1), terme(b, 0)])),
        `On dérive terme à terme : (${terme(a, n)})' = ${terme(a * n, n - 1)} et (${terme(b, 1)})' = ${b}.`);
    },
    () => {                                   // dérivée d'une exponentielle
      const a = Alea.entier(2, 7) * Alea.signe();
      const bonne = `${a === 1 ? "" : a}e^(${a}x)`.replace("-", "−");
      return qcm(`Quelle est la dérivée de f(x) = e^(${a}x) ?`, bonne, fausses(bonne, [
        `e^(${a}x)`,
        `${a}xe^(${a}x)`,
        `e^(${a})`,
      ], () => `${a + Alea.entier(1, 4)}e^(${a}x)`),
        `(e^u)' = u' × e^u, avec u = ${a}x donc u' = ${a}.`);
    },
    () => {                                   // coefficient directeur de la tangente
      const a = Alea.entier(1, 4);
      const b = Alea.entier(-6, 6);
      const x0 = Alea.entier(-3, 3);
      const bonne = 2 * a * x0 + b;
      return qcm(
        `f(x) = ${polynome([terme(a, 2), terme(b, 1)])}. Quel est le coefficient directeur de la tangente en x = ${x0} ?`,
        bonne, fausses(bonne, [a * x0 * x0 + b * x0, 2 * a * x0, a * x0 + b], () => bonne + Alea.entier(1, 6) * Alea.signe()),
        `f'(x) = ${polynome([terme(2 * a, 1), terme(b, 0)])}, donc f'(${x0}) = ${bonne}.`);
    },
    () => {                                   // sens de variation
      const a = Alea.entier(1, 3);
      const b = 2 * a * Alea.entier(1, 4);     // racine entière de f'
      const racine = -b / (2 * a);
      const bonne = `Décroissante sur ]−∞ ; ${racine}] puis croissante`;
      return qcm(
        `f(x) = ${polynome([terme(a, 2), terme(b, 1)])}. Quelles sont les variations de f ?`,
        bonne, fausses(bonne, [
          `Croissante sur ]−∞ ; ${racine}] puis décroissante`,
          "Croissante sur ℝ",
          "Décroissante sur ℝ",
        ], () => `Constante sur ]−∞ ; ${racine}]`),
        `f'(x) = ${polynome([terme(2 * a, 1), terme(b, 0)])} s'annule en ${racine} en changeant de signe.`);
    },
    () => {                                   // dérivée d'un produit
      const a = Alea.entier(2, 5);
      const b = Alea.entier(1, 6);
      const bonne = `(${polynome([terme(a, 1), terme(a + b, 0)])})eˣ`;
      return qcm(`Quelle est la dérivée de f(x) = (${polynome([terme(a, 1), terme(b, 0)])})eˣ ?`,
        bonne, fausses(bonne, [
          `${a}eˣ`,
          `(${polynome([terme(a, 1), terme(b, 0)])})eˣ`,
          `${a}xeˣ`,
        ], () => `(${polynome([terme(a, 1), terme(b + Alea.entier(1, 3), 0)])})eˣ`),
        `(uv)' = u'v + uv' avec u = ${polynome([terme(a, 1), terme(b, 0)])} et v = eˣ : ${a}eˣ + (${polynome([terme(a, 1), terme(b, 0)])})eˣ.`);
    },
  ],

  /* — Probabilités conditionnelles — */
  probas: [
    () => {                                   // probabilité conditionnelle
      const pb = Alea.entier(3, 8);
      const inter = Alea.entier(1, pb - 1);
      const bonne = fraction(inter, pb);
      return qcm(
        `P(A∩B) = ${fraction(inter, 10)} et P(B) = ${fraction(pb, 10)}. Que vaut P<sub>B</sub>(A) ?`,
        bonne, fausses(bonne, [fraction(pb, inter), fraction(inter, 10), fraction(inter * pb, 100)],
          () => fraction(inter, pb + Alea.entier(1, 3))),
        `P<sub>B</sub>(A) = P(A∩B)/P(B) = ${fraction(inter, 10)} ÷ ${fraction(pb, 10)} = ${bonne}.`);
    },
    () => {                                   // tirages sans remise
      const rouges = Alea.entier(2, 5);
      const noires = Alea.entier(2, 5);
      const total = rouges + noires;
      const bonne = fraction(rouges * (rouges - 1), total * (total - 1));
      return qcm(
        `Une urne contient ${rouges} boules rouges et ${noires} noires. On tire 2 boules sans remise : quelle est la probabilité d'obtenir 2 rouges ?`,
        bonne, fausses(bonne, [
          fraction(rouges * rouges, total * total),          // avec remise
          fraction(rouges, total),
          fraction(rouges * (rouges - 1), total * total),
        ], () => fraction(rouges + Alea.entier(1, 2), total)),
        `${fraction(rouges, total)} × ${fraction(rouges - 1, total - 1)} = ${bonne} : la deuxième probabilité change, le tirage est sans remise.`);
    },
    () => {                                   // indépendance
      const a = Alea.entier(2, 5);
      const b = Alea.entier(2, 5);
      const independants = Math.random() < 0.5;
      const inter = independants ? a * b : a * b + Alea.entier(1, 3) * 10;
      const bonne = independants ? "Oui, ils sont indépendants" : "Non, ils ne le sont pas";
      return qcm(
        `P(A) = ${fraction(a, 10)}, P(B) = ${fraction(b, 10)} et P(A∩B) = ${fraction(inter, 100)}. A et B sont-ils indépendants ?`,
        bonne, ["Non, ils ne le sont pas", "Oui, ils sont indépendants", "Ils sont incompatibles", "On ne peut pas conclure"]
          .filter((texte) => texte !== bonne).slice(0, 3),
        `P(A)×P(B) = ${fraction(a * b, 100)}${independants ? " = " : " ≠ "}P(A∩B) = ${fraction(inter, 100)}.`);
    },
    () => {                                   // arbre pondéré
      const pb = Alea.entier(2, 8);
      const pab = Alea.entier(2, 8);
      const bonne = fraction(pb * pab, 100);
      return qcm(
        `Sur un arbre pondéré, P(B) = ${fraction(pb, 10)} et P<sub>B</sub>(A) = ${fraction(pab, 10)}. Que vaut P(A∩B) ?`,
        bonne, fausses(bonne, [fraction(pb + pab, 10), fraction(pab, pb), fraction(pb, pab)],
          () => fraction(pb * pab + Alea.entier(1, 9), 100)),
        `On multiplie le long des branches : P(A∩B) = P(B) × P<sub>B</sub>(A) = ${bonne}.`);
    },
    () => {                                   // probabilités totales
      const pb = Alea.entier(2, 7);
      const inter1 = Alea.entier(1, pb);
      const inter2 = Alea.entier(1, 10 - pb);
      const bonne = fraction(inter1 + inter2, 10);
      return qcm(
        `P(A∩B) = ${fraction(inter1, 10)} et P(A∩B̄) = ${fraction(inter2, 10)}. Que vaut P(A) ?`,
        bonne, fausses(bonne, [fraction(Math.abs(inter1 - inter2), 10), fraction(inter1 * inter2, 100), fraction(inter1, 10)],
          () => fraction(inter1 + inter2 + Alea.entier(1, 2), 10)),
        `B et B̄ forment une partition : P(A) = P(A∩B) + P(A∩B̄) = ${bonne}.`);
    },
  ],

  /* — Suites — */
  suites: [
    () => {                                   // point fixe
      const a = Alea.choix([2, 3, 4, 5, -2, -3]);
      const limite = Alea.entier(-6, 6);
      const b = limite * (1 - a);
      return qcm(
        `Pour la suite définie par uₙ₊₁ = ${a}uₙ ${b < 0 ? "− " + Math.abs(b) : "+ " + b}, quel est le point fixe ℓ ?`,
        limite, fausses(limite, [-limite, b, a + b], () => limite + Alea.entier(1, 5) * Alea.signe()),
        `ℓ = b/(1−a) = ${b}/(1−${a}) = ${limite}.`);
    },
    () => {                                   // limite d'une suite convergente
      const q = Alea.choix(["0,5", "0,8", "0,25", "0,9", "0,1"]);
      const c = Alea.entier(2, 9) * Alea.signe();
      const limite = Alea.entier(-5, 8);
      return qcm(
        `Vers quoi tend la suite uₙ = ${c}×${q}ⁿ ${limite < 0 ? "− " + Math.abs(limite) : "+ " + limite} ?`,
        limite, fausses(limite, [c, c + limite, 0], () => limite + Alea.entier(1, 4)),
        `${q}ⁿ tend vers 0 car la raison est comprise entre −1 et 1 : il ne reste que ${limite}.`);
    },
    () => {                                   // terme d'une suite géométrique
      const u0 = Alea.entier(2, 6);
      const q = Alea.entier(2, 4);
      const n = Alea.entier(2, 4);
      const bonne = u0 * Math.pow(q, n);
      return qcm(
        `Une suite géométrique a pour premier terme u₀ = ${u0} et pour raison q = ${q}. Que vaut u${INDICES[n]} ?`,
        bonne, fausses(bonne, [u0 * q * n, u0 + q * n, u0 * Math.pow(q, n - 1)], () => bonne + Alea.entier(1, 9)),
        `uₙ = u₀ × qⁿ = ${u0} × ${q}${EXPOSANTS[n] || "^" + n} = ${bonne}.`);
    },
    () => {                                   // raison de la suite auxiliaire
      const a = Alea.choix([2, 3, 4, 0.5, 5]);
      const b = Alea.entier(-8, 8);
      const affiche = String(a).replace(".", ",");
      return qcm(
        `Pour uₙ₊₁ = ${affiche}uₙ ${b < 0 ? "− " + Math.abs(b) : "+ " + b}, quelle est la raison de la suite auxiliaire vₙ = uₙ − ℓ ?`,
        affiche, fausses(affiche, [String(b), String(-a).replace(".", ","), String(1 - a).replace(".", ",")],
          () => String(a + Alea.entier(1, 3)).replace(".", ",")),
        `vₙ est géométrique de raison a, ici ${affiche}.`);
    },
    () => {                                   // somme géométrique
      const q = Alea.entier(2, 4);
      const n = Alea.entier(3, 6);
      const bonne = (Math.pow(q, n + 1) - 1) / (q - 1);
      return qcm(
        `Que vaut la somme 1 + ${q} + ${q}² + … + ${q}${EXPOSANTS[n] || "^" + n} ?`,
        bonne, fausses(bonne, [(Math.pow(q, n) - 1) / (q - 1), Math.pow(q, n + 1), Math.pow(q, n)],
          () => bonne + Alea.entier(1, 9)),
        `(1 − q^(n+1))/(1 − q) avec q = ${q} et n = ${n} : il y a n+1 termes.`);
    },
  ],

  /* — Géométrie dans l'espace — */
  vecteurs: [
    () => {                                   // produit scalaire
      const u = [Alea.entier(-5, 5), Alea.entier(-5, 5), Alea.entier(-5, 5)];
      const v = [Alea.entier(-5, 5), Alea.entier(-5, 5), Alea.entier(-5, 5)];
      const bonne = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      return qcm(
        `Que vaut u⃗(${u.join(" ; ")}) · v⃗(${v.join(" ; ")}) ?`,
        bonne, fausses(bonne, [u[0] * v[0], bonne + u[0], -bonne], () => bonne + Alea.entier(1, 7) * Alea.signe()),
        `xx' + yy' + zz' = ${facteur(u[0])}×${facteur(v[0])} + ${facteur(u[1])}×${facteur(v[1])} + ${facteur(u[2])}×${facteur(v[2])} = ${bonne}.`);
    },
    () => {                                   // norme
      const triplet = Alea.choix([[2, 3, 6], [1, 2, 2], [2, 6, 9], [4, 4, 7], [1, 4, 8], [6, 6, 7], [2, 10, 11], [3, 4, 12]]);
      const u = Alea.melanger(triplet);
      const bonne = Math.round(Math.sqrt(u.reduce((s, x) => s + x * x, 0)));
      return qcm(
        `Que vaut la norme ‖u⃗(${u.join(" ; ")})‖ ?`,
        bonne, fausses(bonne, [u.reduce((s, x) => s + x, 0), u.reduce((s, x) => s + x * x, 0), bonne + 1],
          () => bonne + Alea.entier(2, 6)),
        `√(${u.map((x) => x + "²").join(" + ")}) = √${u.reduce((s, x) => s + x * x, 0)} = ${bonne}.`);
    },
    () => {                                   // orthogonalité
      const u = [Alea.entier(1, 5), Alea.entier(1, 5), Alea.entier(1, 5)];
      const orthogonaux = Math.random() < 0.5;
      const v = orthogonaux
        ? [u[1], -u[0], 0]
        : [Alea.entier(1, 4), Alea.entier(1, 4), Alea.entier(1, 4)];
      const produit = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const bonne = produit === 0 ? "Oui, ils sont orthogonaux" : "Non, ils ne le sont pas";
      return qcm(
        `Les vecteurs u⃗(${u.join(" ; ")}) et v⃗(${v.join(" ; ")}) sont-ils orthogonaux ?`,
        bonne, ["Non, ils ne le sont pas", "Oui, ils sont orthogonaux", "Ils sont colinéaires", "On ne peut pas savoir"]
          .filter((texte) => texte !== bonne).slice(0, 3),
        `Leur produit scalaire vaut ${produit}${produit === 0 ? " : ils sont bien orthogonaux." : " ≠ 0."}`);
    },
    () => {                                   // vecteur normal
      const [a, b, c] = [Alea.entier(-4, 4) || 1, Alea.entier(-4, 4) || 2, Alea.entier(-4, 4) || 3];
      const d = Alea.entier(-6, 6);
      const bonne = `(${a} ; ${b} ; ${c})`;
      return qcm(
        `Quel vecteur est normal au plan d'équation ${polynome([terme(a, 1)]).replace("x", "x")} ${b < 0 ? "−" : "+"} ${Math.abs(b)}y ${c < 0 ? "−" : "+"} ${Math.abs(c)}z ${d < 0 ? "−" : "+"} ${Math.abs(d)} = 0 ?`,
        bonne, fausses(bonne, [`(${a} ; ${b} ; ${d})`, `(${-a} ; ${b} ; ${c})`, `(${b} ; ${a} ; ${c})`],
          () => `(${a + Alea.entier(1, 3)} ; ${b} ; ${c})`),
        `Les coefficients de x, y et z donnent directement un vecteur normal.`);
    },
    () => {                                   // appartenance à un plan
      const [a, b, c] = [Alea.entier(1, 3), Alea.entier(1, 3), Alea.entier(1, 3)];
      const point = [Alea.entier(-3, 3), Alea.entier(-3, 3), Alea.entier(-3, 3)];
      const appartient = Math.random() < 0.5;
      const d = -(a * point[0] + b * point[1] + c * point[2]) + (appartient ? 0 : Alea.entier(1, 4));
      const valeur = a * point[0] + b * point[1] + c * point[2] + d;
      const bonne = valeur === 0 ? "Oui, il appartient au plan" : "Non, il n'y appartient pas";
      return qcm(
        `Le point A(${point.join(" ; ")}) appartient-il au plan ${a}x + ${b}y + ${c}z ${d < 0 ? "−" : "+"} ${Math.abs(d)} = 0 ?`,
        bonne, ["Non, il n'y appartient pas", "Oui, il appartient au plan", "Seulement si z = 0", "On ne peut pas conclure"]
          .filter((texte) => texte !== bonne).slice(0, 3),
        `En remplaçant : ${a}×${facteur(point[0])} + ${b}×${facteur(point[1])} + ${c}×${facteur(point[2])} ${d < 0 ? "−" : "+"} ${Math.abs(d)} = ${valeur}.`);
    },
  ],

  /* — Ondes — */
  ondes: [
    () => {                                   // longueur d'onde
      const f = Alea.choix([100, 200, 250, 340, 400, 500, 680, 850]);
      const v = Alea.choix([340, 1500, 3000, 5000]);
      const bonne = `${(v / f).toFixed(2).replace(".", ",").replace(/,?0+$/, "")} m`;
      return qcm(
        `Une onde de fréquence ${f} Hz se propage à ${v} m·s⁻¹. Quelle est sa longueur d'onde ?`,
        bonne, fausses(bonne, [`${(v * f / 1000).toFixed(0)} m`, `${(f / v).toFixed(3).replace(".", ",")} m`, `${v} m`],
          () => `${((v / f) * Alea.entier(2, 4)).toFixed(2).replace(".", ",")} m`),
        `λ = v/f = ${v}/${f} = ${bonne}.`);
    },
    () => {                                   // période
      const f = Alea.choix([2, 4, 5, 10, 20, 50, 100]);
      const bonne = `${(1 / f).toString().replace(".", ",")} s`;
      return qcm(`Quelle est la période d'un signal de fréquence ${f} Hz ?`,
        bonne, fausses(bonne, [`${f} s`, `${(f / 2).toString().replace(".", ",")} s`, `${(2 / f).toString().replace(".", ",")} s`],
          () => `${(1 / (f + Alea.entier(1, 5))).toFixed(3).replace(".", ",")} s`),
        `T = 1/f = 1/${f} = ${bonne}.`);
    },
    () => {                                   // interférences
      const k = Alea.entier(1, 4);
      const constructif = Math.random() < 0.5;
      const bonne = constructif ? `δ = ${k}λ` : `δ = ${k},5λ`;
      return qcm(
        `Quelle différence de marche donne des interférences ${constructif ? "constructives" : "destructives"} ?`,
        bonne, [`δ = ${constructif ? k + ",5λ" : k + "λ"}`, "δ = λ/4", "δ = λ/3"],
        constructif
          ? "Les ondes sont en phase quand δ est un multiple entier de λ."
          : "Les ondes sont en opposition de phase quand δ vaut (k + ½)λ.");
    },
    () => {                                   // célérité
      const lambda = Alea.choix([0.5, 1.5, 2, 2.5, 4]);
      const f = Alea.choix([100, 200, 400, 500]);
      const bonne = `${lambda * f} m·s⁻¹`;
      return qcm(
        `Une onde a pour longueur d'onde ${String(lambda).replace(".", ",")} m et pour fréquence ${f} Hz. Quelle est sa célérité ?`,
        bonne, fausses(bonne, [`${(f / lambda).toFixed(0)} m·s⁻¹`, `${(lambda / f).toFixed(4).replace(".", ",")} m·s⁻¹`, `${f} m·s⁻¹`],
          () => `${lambda * f + Alea.entier(10, 90)} m·s⁻¹`),
        `v = λ × f = ${String(lambda).replace(".", ",")} × ${f} = ${bonne}.`);
    },
    () => {                                   // diffraction
      const grande = Math.random() < 0.5;
      const bonne = grande ? "L'écart angulaire augmente" : "L'écart angulaire diminue";
      return qcm(
        `Que devient la figure de diffraction si l'on ${grande ? "réduit" : "élargit"} l'ouverture ?`,
        bonne, [grande ? "L'écart angulaire diminue" : "L'écart angulaire augmente",
                "Rien ne change", "La fréquence de l'onde change"],
        `θ ≈ λ/a : l'écart angulaire varie en sens inverse de la largeur a de l'ouverture.`);
    },
  ],
};

/* Chapitres factuels : les questions naissent d'une table de faits. */
GENERATEURS.guerrefroide = questionsDatees([
  { annee: 1945, evenement: "les conférences de Yalta et Potsdam" },
  { annee: 1947, evenement: "la doctrine Truman et la doctrine Jdanov" },
  { annee: 1948, evenement: "le début du blocus de Berlin" },
  { annee: 1949, evenement: "la création de l'OTAN et la partition de l'Allemagne" },
  { annee: 1955, evenement: "la signature du pacte de Varsovie" },
  { annee: 1961, evenement: "la construction du mur de Berlin" },
  { annee: 1962, evenement: "la crise des missiles de Cuba" },
  { annee: 1975, evenement: "la fin de la guerre du Vietnam" },
  { annee: 1985, evenement: "l'arrivée de Gorbatchev au pouvoir" },
  { annee: 1989, evenement: "la chute du mur de Berlin" },
  { annee: 1991, evenement: "la dissolution de l'URSS" },
]);

GENERATEURS.genetique = questionsNotions([
  { terme: "La méiose", definition: "la division qui produit quatre cellules haploïdes génétiquement différentes" },
  { terme: "La mitose", definition: "la division qui produit deux cellules filles identiques à la cellule mère" },
  { terme: "Le crossing-over", definition: "l'échange de portions entre chromosomes homologues, en prophase I" },
  { terme: "Le brassage interchromosomique", definition: "la répartition aléatoire des chromosomes homologues en anaphase I" },
  { terme: "La fécondation", definition: "la réunion au hasard de deux gamètes, troisième source de brassage" },
  { terme: "Une mutation silencieuse", definition: "une mutation ponctuelle qui ne change pas l'acide aminé codé" },
  { terme: "La redondance du code génétique", definition: "le fait que 64 codons codent seulement 20 acides aminés" },
  { terme: "Un allèle", definition: "une version particulière d'un gène" },
  { terme: "Un gamète", definition: "une cellule reproductrice haploïde" },
  { terme: "Un caryotype", definition: "la photographie ordonnée des chromosomes d'une cellule" },
  { terme: "Un génotype", definition: "l'ensemble des allèles portés par un individu" },
  { terme: "Un phénotype", definition: "l'ensemble des caractères observables d'un individu" },
  { terme: "Une cellule haploïde", definition: "une cellule qui ne porte qu'un exemplaire de chaque chromosome" },
  { terme: "Un croisement test", definition: "le croisement avec un double récessif, qui révèle si deux gènes sont liés" },
]);

GENERATEURS.conscience = questionsAuteurs([
  { auteur: "Descartes", these: "le doute lui-même prouve l'existence du sujet pensant" },
  { auteur: "Freud", these: "le moi n'est pas maître dans sa propre maison" },
  { auteur: "Hegel", these: "la conscience de soi exige la reconnaissance par autrui" },
  { auteur: "Sartre", these: "l'existence précède l'essence et l'homme est condamné à être libre" },
  { auteur: "Locke", these: "l'identité personnelle repose sur la continuité de la mémoire" },
  { auteur: "Kant", these: "le « je pense » doit pouvoir accompagner toutes mes représentations" },
  { auteur: "Nietzsche", these: "la conscience est tardive et largement dictée par le corps" },
  { auteur: "Bergson", these: "la conscience est durée vécue, irréductible au temps mesuré" },
  { auteur: "Merleau-Ponty", these: "la conscience est d'abord incarnée dans un corps propre" },
  { auteur: "Alain", these: "penser, c'est dire non — la conscience est refus et distance" },
]);

GENERATEURS.philosophieNotions = questionsNotions([
  { terme: "Le cogito", definition: "le raisonnement qui tire de l'acte de douter la preuve que l'on existe" },
  { terme: "L'inconscient", definition: "la part du psychisme qui échappe à la conscience et agit sur elle" },
  { terme: "La mauvaise foi", definition: "le mensonge que l'on se fait à soi-même pour fuir sa liberté" },
  { terme: "La conscience morale", definition: "la capacité à juger le bien et le mal de ses propres actes" },
  { terme: "La conscience de soi", definition: "le pouvoir de se prendre soi-même pour objet de réflexion" },
]);

/* La philosophie mêle questions d'auteurs et questions de notions. */
GENERATEURS.conscience = GENERATEURS.conscience.concat(GENERATEURS.philosophieNotions);
delete GENERATEURS.philosophieNotions;
