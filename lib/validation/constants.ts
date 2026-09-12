export const FACILITY_TYPES = [
  "independent-living",
  "assisted-living",
  "memory-care",
  "skilled-nursing",
  "adult-day",
  "senior-center",
  "rehabilitation",
  "other",
] as const;

export const GENRES = [
  "standards",
  "jazz",
  "big-band",
  "classical",
  "country",
  "folk",
  "gospel",
  "hymns",
  "oldies",
  "rock-n-roll",
  "motown",
  "broadway",
  "latin",
  "bluegrass",
  "blues",
  "patriotic",
  "holiday",
] as const;

export const INSTRUMENTS = [
  "vocals",
  "piano",
  "keyboard",
  "guitar",
  "ukulele",
  "violin",
  "cello",
  "harp",
  "flute",
  "saxophone",
  "trumpet",
  "accordion",
  "banjo",
  "drums",
  "harmonica",
] as const;

/** Programming-relevant audience considerations. Deliberately generic — no resident health data. */
export const AUDIENCE_TAGS = [
  "independent-living",
  "assisted-living",
  "memory-care",
  "skilled-nursing",
  "limited-mobility",
  "hearing-support",
  "low-vision",
  "small-group",
  "large-group",
  "bedside",
] as const;

export const THERAPEUTIC_QUALIFICATIONS = ["MT-BC", "Certified Music Practitioner", "Music & Memory Certified", "Dementia Care Specialist"] as const;

export const CERTIFICATIONS = ["CPR/First Aid", "Volunteer Orientation", "Infection Control Training"] as const;

export const PROGRAM_TAGS = ["sing-along", "interactive", "dance", "seasonal", "themed", "memory-care", "chair-exercise", "bedside", "storytelling"] as const;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const FEEDBACK_ISSUES_CLIENT = ["late-arrival", "no-show", "volume", "song-selection", "engagement", "professionalism", "equipment", "other"] as const;
export const FEEDBACK_ISSUES_MUSICIAN = ["access-parking", "room-setup", "equipment", "audience-size", "staff-support", "payment", "safety", "other"] as const;

export const LOW_RATING_THRESHOLD = 3;

/** US states and DC, for address validation and selectors. */
export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;
export const US_STATE_CODES = US_STATES.map(([c]) => c);

/** IANA time zones used across the United States. Every event is stored in UTC and shown in the facility's zone. */
export const US_TIMEZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona (no DST)"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Puerto_Rico", "Atlantic (Puerto Rico)"],
] as const;
export const US_TIMEZONE_IDS = US_TIMEZONES.map(([id]) => id);

/** Best-guess time zone for a state (states that span zones use the more populous zone). */
export const STATE_TIMEZONE: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", IN: "America/New_York", KY: "America/New_York", ME: "America/New_York", MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", NH: "America/New_York", NJ: "America/New_York", NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York", WV: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", NE: "America/Chicago", ND: "America/Chicago", OK: "America/Chicago", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", ID: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
};
