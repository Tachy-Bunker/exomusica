// The calendar's language (fix413+). English by default. "?fr" in the link (or the page's button) shows it in French, and the
// button takes it back. The English text is the key: anything without a French line shows in English. Server messages are
// matched here too (exact sentences and a few patterns), so the calendar speaks one language throughout.
import { createContext, useCallback, useContext, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type CalLang = "en" | "fr";
export type Vars = Record<string, string | number>;
export interface CalLangApi { lang: CalLang; locale: string; t: (text: string, vars?: Vars) => string; setLang: (l: CalLang) => void }

export const langOf = (search: string): CalLang => (new URLSearchParams(search).has("fr") ? "fr" : "en");
export const localeOf = (lang: CalLang): string => (lang === "fr" ? "fr-FR" : "en-GB");

// English → French. Keys are the English sentences as the components write them.
const FR: Record<string, string> = {
  // the calendars page
  "Calendars": "Calendriers",
  "Shared calendars anyone can read and add to. A calendar with a password is opened from its link: the password is in the link after the #.":
    "Des calendriers partagés, que chacun peut lire et compléter. Un calendrier protégé s'ouvre par son lien : le mot de passe est dans le lien, après le #.",
  "Loading…": "Chargement…",
  "1 event": "1 événement",
  "{n} events": "{n} événements",
  "No calendars yet.": "Pas encore de calendrier.",
  "New calendar": "Nouveau calendrier",
  "Name": "Nom",
  "Address (optional; from the name if empty)": "Adresse (facultative ; tirée du nom si vide)",
  "Time zone": "Fuseau horaire",
  "Password (optional; leave empty for an open calendar)": "Mot de passe (facultatif ; vide = calendrier ouvert)",
  "Make it": "Créer",
  "Only the site's admin makes calendars here.": "Seul l'administrateur du site crée des calendriers ici.",
  "Who may change events": "Qui peut modifier les événements",
  "Anyone who can open it": "Toute personne qui peut l'ouvrir",
  "Only these people": "Seulement ces personnes",
  "Members (site usernames, separated by commas)": "Membres (noms d'utilisateur du site, séparés par des virgules)",
  "The creator and the site's admin can always change events. A member signs in with their site account and needs no password.":
    "Le créateur et l'administrateur du site peuvent toujours modifier. Un membre se connecte avec son compte du site et n'a pas besoin de mot de passe.",
  "Pictures kept": "Images gardées",
  "Past this number, the picture of the oldest event goes. Only the site's admin sets it.":
    "Au-delà de ce nombre, l'image de l'événement le plus ancien part. Seul l'administrateur du site le règle.",
  "Pictures kept: {n}": "Images gardées : {n}",
  "Save who may change events": "Enregistrer qui peut modifier",
  "Save the picture limit": "Enregistrer la limite d'images",
  "Saved.": "Enregistré.",
  "Français": "Français",
  "English": "English",

  // the calendar page
  "Month": "Mois",
  "Week": "Semaine",
  "Agenda": "Agenda",
  "Discover": "Découvrir",
  "Places": "Lieux",
  "Search": "Chercher",
  "How to browse": "Comment parcourir",
  "with a password": "avec un mot de passe",
  "open": "ouvert",
  "Add event": "Ajouter un événement",
  "Settings": "Réglages",
  "All calendars": "Tous les calendriers",
  "Read only for you: only its members change it.": "Lecture seule pour vous : seuls ses membres le modifient.",
  "Previous month": "Mois précédent",
  "Next month": "Mois suivant",
  "Today": "Aujourd'hui",
  "Previous week": "Semaine précédente",
  "Next week": "Semaine suivante",
  "This week": "Cette semaine",
  "Week of {date}": "Semaine du {date}",
  "Find a word…": "Chercher un mot…",
  "Find in this calendar": "Chercher dans ce calendrier",
  "All places": "Tous les lieux",
  "With a picture": "Avec une image",
  "Only the first events in this stretch are shown; narrow it with Find.":
    "Seuls les premiers événements de cette période sont affichés ; affinez avec Chercher.",
  "This calendar has a password. The link you were given carries it after the #; or type it here.":
    "Ce calendrier a un mot de passe. Le lien reçu le porte après le # ; sinon, tapez-le ici.",
  "Password": "Mot de passe",
  "Open": "Ouvrir",
  "There is no calendar at this address.": "Il n'y a pas de calendrier à cette adresse.",
  "See the open calendars": "Voir les calendriers",
  "Nothing in the next 60 days yet.": "Rien dans les 60 prochains jours pour l'instant.",
  "Nothing matches that.": "Rien ne correspond.",
  "Type a word in Find to search the whole calendar.": "Tapez un mot dans Chercher pour fouiller tout le calendrier.",
  "Delete “{title}”?": "Supprimer « {title} » ?",
  "+{n} more": "+{n} de plus",
  "Nothing on this day yet.": "Rien ce jour-là pour l'instant.",
  "Nothing yet.": "Rien pour l'instant.",
  "+ Add on this day": "+ Ajouter ce jour-là",
  "all day": "toute la journée",
  "Shuffle": "Mélanger",
  "Nothing coming up in the next 60 days yet.": "Rien à venir dans les 60 prochains jours pour l'instant.",
  "No place is named in these events yet.": "Aucun lieu n'est indiqué dans ces événements pour l'instant.",
  "Event": "Événement",

  // the event sheet
  "Place": "Lieu",
  "Link": "Lien",
  "Added by {name}": "Ajouté par {name}",
  "someone": "quelqu'un",
  "Edit": "Modifier",
  "Delete": "Supprimer",
  "Close": "Fermer",

  // the event form
  "Change the event": "Modifier l'événement",
  "Add an event": "Ajouter un événement",
  "Quick add: “Ambient set at Le Trianon, 2 Nov 20:00”, “Live samedi de 20h à 23h au Glazart”, or paste a link":
    "Ajout rapide : « Ambient set at Le Trianon, 2 Nov 20:00 », « Live samedi de 20h à 23h au Glazart », ou collez un lien",
  "Type a line, then Enter": "Tapez une ligne, puis Entrée",
  "Read": "Lire",
  "Reading the link…": "Lecture du lien…",
  "Read the link: {name}": "Lien lu : {name}",
  "Read: {parts}. Check it, then save.": "Lu : {parts}. Vérifiez, puis enregistrez.",
  "Nothing was read from that line.": "Rien n'a été lu dans cette ligne.",
  "title “{v}”": "titre « {v} »",
  "place “{v}”": "lieu « {v} »",
  "day": "jour",
  "start {v}": "début {v}",
  "end {v}": "fin {v}",
  "link": "lien",
  "Give the event a title.": "Donnez un titre à l'événement.",
  "Pick a day.": "Choisissez un jour.",
  "Title": "Titre",
  "Day": "Jour",
  "Start": "Début",
  "End": "Fin",
  "Times are in this calendar's time zone ({tz}). No start time means all day.":
    "Les heures sont dans le fuseau du calendrier ({tz}). Sans heure de début, l'événement dure toute la journée.",
  "Text": "Texte",
  "Change the picture": "Changer l'image",
  "Add a picture": "Ajouter une image",
  "Remove the picture": "Retirer l'image",
  "Your name (shown as “added by”)": "Votre nom (affiché « ajouté par »)",
  "Save changes": "Enregistrer",
  "Cancel": "Annuler",
  "To make room, the oldest picture on this calendar was removed.": "Pour faire place, l'image la plus ancienne de ce calendrier a été retirée.",
  "Something went wrong.": "Une erreur est survenue.",
  "Something went wrong. Try again.": "Une erreur est survenue. Réessayez.",

  // the settings
  "Calendar settings": "Réglages du calendrier",
  "Save": "Enregistrer",
  "Current password": "Mot de passe actuel",
  "New password (empty removes it)": "Nouveau mot de passe (vide = le retirer)",
  "Change": "Changer",
  "Put a password on it": "Mettre un mot de passe",
  "Type a new password first.": "Tapez d'abord un nouveau mot de passe.",
  "Password changed. Everyone else is signed out; the links need the new password.":
    "Mot de passe changé. Les autres sont déconnectés ; les liens doivent porter le nouveau.",
  "Password removed. The calendar is open.": "Mot de passe retiré. Le calendrier est ouvert.",
  "Sign out everyone else": "Déconnecter les autres",
  "Everyone else is signed out.": "Les autres sont déconnectés.",
  "Delete this calendar": "Supprimer ce calendrier",
  "Delete “{name}” and all its events and pictures?": "Supprimer « {name} » et tous ses événements et images ?",

  // the gate and server sentences
  "That password does not open this calendar.": "Ce mot de passe n'ouvre pas ce calendrier.",
  "This calendar is locked. Open its link (with its password) first.": "Ce calendrier est fermé. Ouvrez d'abord son lien (avec son mot de passe).",
  "Wrong calendar or password.": "Mauvais calendrier ou mot de passe.",
  "No calendar at this address.": "Il n'y a pas de calendrier à cette adresse.",
  "You can look at this calendar, but only its editors change it.": "Vous pouvez le consulter, mais seuls ses éditeurs le modifient.",
  "Only the creator or the site's admin can change who may edit.": "Seul le créateur ou l'administrateur du site peut changer qui peut modifier.",
  "Only the site's admin can change the picture limit.": "Seul l'administrateur du site peut changer la limite d'images.",
  "Only the site's admin can create a calendar.": "Seul l'administrateur du site peut créer un calendrier.",
  "Only the site's admin can delete a calendar.": "Seul l'administrateur du site peut supprimer un calendrier.",
  "Only the site's admin can put a password on an open calendar.": "Seul l'administrateur du site peut mettre un mot de passe sur un calendrier ouvert.",
  "The current password is wrong.": "Le mot de passe actuel est faux.",
  "That address is taken.": "Cette adresse est déjà prise.",
  "A calendar needs a name.": "Un calendrier a besoin d'un nom.",
  "An address is 2 to 40 letters, digits or dashes, and does not start or end with a dash.":
    "Une adresse fait 2 à 40 lettres, chiffres ou tirets, sans tiret au début ni à la fin.",
  "That time zone is not known. Use a name such as Europe/Paris.": "Ce fuseau horaire est inconnu. Utilisez un nom comme Europe/Paris.",
  "An event needs a title.": "Un événement a besoin d'un titre.",
  "The link must start with https:// (or http://).": "Le lien doit commencer par https:// (ou http://).",
  "The start is missing or is not a date and time.": "Le début manque ou n'est pas une date et une heure.",
  "The end is not a date and time.": "La fin n'est pas une date et une heure.",
  "The end is before the start.": "La fin est avant le début.",
  "The picture is not valid.": "Cette image n'est pas valide.",
  "No event sent.": "Aucun événement reçu.",
  "The picture is not a valid image.": "Ce fichier n'est pas une image valide.",
  "The picture is larger than 1 MB.": "L'image fait plus de 1 Mo.",
  "Only PNG, JPEG and WebP pictures are kept.": "Seules les images PNG, JPEG et WebP sont gardées.",
  "That picture is not in this calendar.": "Cette image n'est pas dans ce calendrier.",
  "This calendar is full.": "Ce calendrier est plein.",
  "Paste a link first.": "Collez d'abord un lien.",
  "Too many changes in a short time. Wait a moment.": "Trop de modifications en peu de temps. Attendez un instant.",
  "Too many links in a short time. Wait a few minutes.": "Trop de liens en peu de temps. Attendez quelques minutes.",
  "Only the standard web ports are read": "Seuls les ports web standard sont lus",
  "That page is not one we can read": "Cette page n'est pas lisible ici",
  "That file is too large": "Ce fichier est trop volumineux",
  "Could not read that page.": "Impossible de lire cette page.",
  "Something went wrong": "Une erreur est survenue",
};

/** Sentences with a number or a name in them. */
const PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Too many attempts\. Try again in (\d+) minutes?\.$/, (m) => `Trop d'essais. Réessayez dans ${m[1]} min.`],
  [/^No account is called “(.+)”\.$/, (m) => `Aucun compte ne s'appelle « ${m[1]} ».`],
  [/^The password is (\d+) to (\d+) characters\.$/, (m) => `Le mot de passe fait de ${m[1]} à ${m[2]} caractères.`],
  [/^The picture limit is a whole number from (\d+) to (\d+)\.$/, (m) => `La limite d'images est un nombre entier de ${m[1]} à ${m[2]}.`],
  [/^A calendar has at most (\d+) members\.$/, (m) => `Un calendrier a au plus ${m[1]} membres.`],
  [/^“(.+)” is reserved\. Pick another address\.$/, (m) => `« ${m[1]} » est réservée. Choisissez une autre adresse.`],
  [/^The site answered (\d+)$/, (m) => `Le site a répondu ${m[1]}.`],
];

/** The text in the language: the French line when there is one, then the variables put in. */
export function tr(lang: CalLang, text: string, vars?: Vars): string {
  let out = text;
  if (lang === "fr") {
    const hit = FR[text];
    if (hit !== undefined) out = hit;
    else for (const [re, make] of PATTERNS) { const m = re.exec(text); if (m) { out = make(m); break; } }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** The language of the calendar page: from the link, and a setter that rewrites the link (no reload, no lost password field). */
export function useCalLangState(): CalLangApi {
  const { search, hash, pathname } = useLocation();
  const nav = useNavigate();
  const lang = langOf(search);
  const setLang = useCallback((l: CalLang) => {
    const rest = new URLSearchParams(search);
    rest.delete("fr");
    const q = [rest.toString(), l === "fr" ? "fr" : ""].filter(Boolean).join("&");
    nav({ pathname, search: q ? `?${q}` : "", hash }, { replace: true });
  }, [search, hash, pathname, nav]);
  return useMemo(() => ({ lang, locale: localeOf(lang), t: (text, vars) => tr(lang, text, vars), setLang }), [lang, setLang]);
}

const CalLangContext = createContext<CalLangApi>({ lang: "en", locale: "en-GB", t: (text, vars) => tr("en", text, vars), setLang: () => undefined });
export const CalLangProvider = CalLangContext.Provider;
export const useCalLang = (): CalLangApi => useContext(CalLangContext);
