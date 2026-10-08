export const messages = {
  appName: "Eximion",
  skip: "Skip to content",
  home: "Eximion home",
  descriptor: "Clinical learning lab",
  disclaimer:
    "For education only. Use synthetic cases. This is not a medical diagnostic system.",
  create: "Create a case",
  demo: "Try the demo case",
  back: "All cases",
  homeTitle: "From clinical clues to clear thinking.",
  homeDescription:
    "Turn a synthetic clinical note into an editable learning case, then practice recognizing the diagnosis.",
  homeEyebrow: "A small space to practice clinical reasoning",
  workflow: "How it works",
  illustration: {
    label: "SYNTHETIC CASE / 001",
    symptoms: ["Fever", "Dry cough", "Fatigue"],
    clues: "Clinical clues",
    reasoning: "→ Your reasoning",
  },
  steps: [
    {
      title: "Extract the essentials",
      description:
        "Paste a synthetic note. Gemini organizes the clinical details into a draft.",
    },
    {
      title: "Make it a fair challenge",
      description:
        "Review the facts, remove diagnosis clues, and add your own accepted answers.",
    },
    {
      title: "Practice and get feedback",
      description:
        "Read the saved case and submit a diagnosis for an immediate score.",
    },
  ],
  demoTitle: "Start with a short case",
  demoDescription:
    "Explore a prepared learning case about fever and cough. No author key needed.",
  newEyebrow: "Case authoring",
  newTitle: "Build a learning case",
  newDescription:
    "Extract a draft, check every detail, and set the answer yourself.",
  sourceTitle: "1. Start with a clinical note",
  sourceDescription:
    "Use synthetic data only. Do not include names, contact details, or real patient information.",
  sourceLabel: "Clinical text",
  sourcePlaceholder:
    "A 28-year-old presents with fever, dry cough, and fatigue for two days…",
  sourceHint:
    "20–20,000 characters. The source text is used for extraction and is not saved with the case.",
  keyLabel: "Author key",
  keyHint:
    "Required for protected deployments. Kept in memory only for this page.",
  extract: "Extract case",
  extracting: "Extracting draft…",
  reextract: "Extract again",
  draftTitle: "2. Review the structured draft",
  draftDescription:
    "Correct the details and remove any explicit diagnosis from the title, vignette, and symptoms.",
  draftPlaceholder: "Your editable draft will appear here after extraction.",
  titleLabel: "Case title",
  vignetteLabel: "Clinical vignette",
  symptomsLabel: "Symptoms",
  symptomsHint:
    "One symptom per line, up to 20. Each symptom can contain up to 200 characters.",
  ageLabel: "Age in years",
  ageHint: "Optional. Leave blank if the note does not state an age.",
  answersTitle: "3. Set the accepted diagnosis",
  answersDescription:
    "You supply the reference answer independently. It is hidden from people solving the case.",
  referenceLabel: "Reference diagnosis",
  alternativesLabel: "Accepted alternatives",
  alternativesHint:
    "Optional, one per line, up to 20. Include explicit synonyms or abbreviations you want to accept.",
  reviewedLabel:
    "I checked every field for accuracy and removed any revealed diagnosis from the public case.",
  reviewHint: "Editing a field requires you to confirm the review again.",
  save: "Save case",
  saving: "Saving case…",
  invalidNul: "Remove null characters from this field.",
  textLength: (min: number, max: number) =>
    `Enter ${min}-${max.toLocaleString("en-US")} characters after trimming surrounding whitespace.`,
  invalidAge: "Enter a whole-number age between 0 and 120, or leave it blank.",
  draftReady: "Draft extracted. Review the fields below.",
  invalidList: "Enter 1–20 symptoms, each containing 1–200 characters.",
  invalidAlternatives:
    "Enter no more than 20 accepted alternatives, each containing 1–200 characters.",
  reviewRequired: "Review the draft and confirm the checklist before saving.",
  practiceEyebrow: "Clinical reasoning practice",
  practiceDescription:
    "Read the vignette, consider the symptoms, and submit your diagnosis.",
  vignette: "Clinical vignette",
  symptoms: "Reported symptoms",
  age: "Age",
  years: "years",
  ageUnknown: "Not stated",
  diagnosisLabel: "Your diagnosis",
  diagnosisPlaceholder: "Enter a diagnosis",
  diagnosisHint:
    "Scoring matches the author’s reference or an explicit alternative. Capitalization and spacing do not matter.",
  submit: "Submit diagnosis",
  submitting: "Checking answer…",
  correct: "Accepted diagnosis",
  incorrect: "Keep thinking",
  score: "Score",
  another: "You can edit your answer and try again.",
  loading: "Loading clinical case…",
  notFoundTitle: "Case not found",
  notFoundDescription: "This case does not exist, or its link is incomplete.",
  errorTitle: "Unable to load this case",
  retry: "Try again",
  requestError: "The request could not be completed. Please try again.",
  networkError:
    "Cannot reach the service. Check your connection and try again.",
  timeoutError:
    "The request timed out. Your input is preserved. Please try again.",
  validationError: "Check the entered values and try again.",
  unauthorized:
    "The author key is missing or incorrect. Check it and try again.",
  unavailable:
    "The service is temporarily unavailable. Please try again shortly.",
};

export const DEMO_CASE_ID = "4613eeb7-7064-41da-bb06-62630b3eaebc";
