import type { Translations } from './en';

/** Deutsche Texte (Schweizer Rechtschreibung: ss statt ß). */
export const de: Translations = {
  common: {
    cancel: 'Abbrechen',
    close: 'Schliessen',
    continue: 'Weiter',
    retry: 'Nochmals versuchen',
    show: 'Anzeigen',
    hide: 'Verbergen',
    dismiss: 'Ausblenden',
    or: 'oder',
    version: 'Version {{version}}',
  },
  config: {
    title: 'Die App ist nicht eingerichtet',
    message:
      'Dieser Build hat keine Verbindung zu seinem Server. Setze die folgenden Variablen und starte die App neu (siehe Setup-Anleitung).',
  },
  auth: {
    tagline: 'Jeder Franken zählt.',
    email: 'E-Mail',
    password: 'Passwort',
    newPassword: 'Neues Passwort',
    passwordHint: 'Mindestens 10 Zeichen.',
    signIn: {
      title: 'Willkommen zurück',
      submit: 'Anmelden',
      forgotPassword: 'Passwort vergessen?',
      noAccount: 'Neu hier?',
      createAccount: 'Konto erstellen',
    },
    signUp: {
      title: 'Konto erstellen',
      subtitle: 'Einmal den Monat einrichten. Danach zählen wir jeden Franken mit.',
      submit: 'Konto erstellen',
      haveAccount: 'Schon ein Konto?',
      signIn: 'Anmelden',
    },
    providers: {
      google: 'Weiter mit Google',
      apple: 'Weiter mit Apple',
    },
    checkEmail: {
      title: 'Schau in dein Postfach',
      message:
        'Wir haben einen Bestätigungslink an {{email}} geschickt. Öffne ihn auf diesem Handy, um dein Konto fertig zu erstellen.',
      resend: 'Link nochmals senden',
      resent: 'Ein neuer Link ist unterwegs.',
      backToSignIn: 'Zurück zur Anmeldung',
    },
    forgotPassword: {
      title: 'Passwort zurücksetzen',
      message:
        'Gib die E-Mail-Adresse deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort wählst.',
      submit: 'Link senden',
      sent: 'Falls {{email}} ein Konto hat, ist ein Link unterwegs. Öffne ihn auf diesem Handy.',
      backToSignIn: 'Zurück zur Anmeldung',
    },
    resetPassword: {
      title: 'Neues Passwort wählen',
      message: 'Du bist über den Link angemeldet. Wähle ein neues Passwort, um weiterzumachen.',
      submit: 'Passwort speichern',
      cancel: 'Abbrechen und abmelden',
    },
    callback: {
      working: 'Du wirst angemeldet …',
      failedTitle: 'Dieser Link hat nicht funktioniert',
    },
    notices: {
      accountDeleted: 'Dein Konto und alle Daten darin wurden gelöscht.',
      passwordUpdated: 'Dein neues Passwort ist gespeichert.',
    },
    validation: {
      email_required: 'Gib deine E-Mail-Adresse ein.',
      email_invalid: 'Das sieht nicht nach einer E-Mail-Adresse aus.',
      password_required: 'Gib dein Passwort ein.',
      password_too_short: 'Verwende mindestens 10 Zeichen.',
      password_too_long: 'Das Passwort ist zu lang. Verwende höchstens 72 Zeichen.',
    },
    errors: {
      invalid_credentials: 'E-Mail oder Passwort stimmt nicht.',
      email_not_confirmed:
        'Bitte bestätige zuerst deine E-Mail-Adresse. Wir können dir den Link nochmals senden.',
      user_already_exists: 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich stattdessen an.',
      weak_password: 'Wähle ein stärkeres Passwort, das nicht leicht zu erraten ist.',
      rate_limited: 'Zu viele Versuche. Warte eine Minute und versuche es dann nochmals.',
      network: 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es nochmals.',
      provider_disabled: 'Diese Anmeldeart ist gerade nicht verfügbar.',
      signup_disabled: 'Neue Konten können gerade nicht erstellt werden.',
      session_expired: 'Du wurdest abgemeldet. Bitte melde dich erneut an.',
      link_invalid:
        'Der Link ist abgelaufen, wurde schon verwendet oder auf einem anderen Gerät geöffnet. Fordere einen neuen an oder melde dich an, falls du deine E-Mail schon bestätigt hast.',
      unknown: 'Etwas ist schiefgelaufen. Bitte versuche es nochmals.',
    },
  },
  tabs: {
    home: 'Übersicht',
    transactions: 'Ausgaben',
    assistant: 'KI',
    insights: 'Auswertung',
    settings: 'Einstellungen',
  },
  home: {
    emptyTitle: 'Hier beginnt dein Monat',
    emptyMessage:
      'Sobald Einkommen, Fixkosten und Budgets eingerichtet sind, erscheinen hier dein Kontostand und deine Kategorien.',
  },
  transactions: {
    emptyTitle: 'Noch keine Ausgaben',
    emptyMessage: 'Einkäufe erscheinen hier, sobald sie erfasst sind.',
  },
  assistant: {
    emptyTitle: 'Frag nach deinem Geld',
    emptyMessage:
      'Dein Assistent antwortet nur aus deinen eigenen Budgets und Ausgaben. Noch hat er nichts, womit er arbeiten kann.',
  },
  insights: {
    emptyTitle: 'Noch nichts zu vergleichen',
    emptyMessage:
      'Ausgaben pro Kategorie, Monatsvergleich und die häufigsten Händler erscheinen nach deinen ersten Ausgaben.',
  },
  settings: {
    title: 'Einstellungen',
    account: 'Konto',
    signedInAs: 'Angemeldet als',
    signOut: 'Abmelden',
    deleteAccount: 'Konto löschen',
    preferences: 'Darstellung und Sprache',
    language: 'Sprache',
    appearance: 'Erscheinungsbild',
    appearanceOptions: {
      system: 'Wie das Handy',
      light: 'Hell',
      dark: 'Dunkel',
    },
    about: 'Über die App',
    environment: 'Umgebung: {{environment}}',
    signOutFailed: 'Das Abmelden hat nicht geklappt. Bitte versuche es nochmals.',
    deleteSheet: {
      title: 'Konto löschen?',
      message:
        'Damit löschst du dein Konto und alles darin endgültig: Einkommen, Budgets, Ausgaben, verbundene Quellen und Einstellungen. Das lässt sich nicht rückgängig machen.',
      confirm: 'Alles löschen',
      cancel: 'Konto behalten',
    },
  },
  languageNames: {
    de: 'Deutsch',
    en: 'English',
  },
  notFound: {
    title: 'Seite nicht gefunden',
    home: 'Zur Übersicht',
  },
};
