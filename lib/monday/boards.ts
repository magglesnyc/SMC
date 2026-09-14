/**
 * Board and column ids for the client's Monday account ("Senior Music Connection - Revised Flow" workspace).
 * Column ids are stable per board; board ids can be overridden per environment so a test copy of the boards
 * can be used without touching live data (MONDAY_BOARD_<KEY>=<id>).
 */

const env = (key: string, fallback: string) => process.env[`MONDAY_BOARD_${key}`] || fallback;

export const BOARDS = {
  entertainers: env("ENTERTAINERS", "9813945163"), // Partner Entertainer List
  clients: env("CLIENTS", "9814625326"), // Client List
  bookingRequests: env("BOOKING_REQUESTS", "9813564878"), // Facility Booking Request Form
  gigs: env("GIGS", "9814746459"), // Gig Tracker
  facilityFeedback: env("FACILITY_FEEDBACK", "9867190506"), // Facility Feedback Form
  entertainerFeedback: env("ENTERTAINER_FEEDBACK", "9867250483"), // Entertainer Feedback Form
  applications: env("APPLICATIONS", "9812612090"), // Entertainer Applications
  clientAgreements: env("CLIENT_AGREEMENTS", "9866308677"), // Client Service Agreement (read-only)
  entertainerAgreements: env("ENTERTAINER_AGREEMENTS", "9823046743"), // Partner Entertainer Service Agreement (read-only)
} as const;
export type BoardKey = keyof typeof BOARDS;

export const BOARD_LABELS: Record<BoardKey, string> = {
  entertainers: "Partner Entertainer List",
  clients: "Client List",
  bookingRequests: "Facility Booking Request Form",
  gigs: "Gig Tracker",
  facilityFeedback: "Facility Feedback Form",
  entertainerFeedback: "Entertainer Feedback Form",
  applications: "Entertainer Applications",
  clientAgreements: "Client Service Agreement",
  entertainerAgreements: "Partner Entertainer Service Agreement",
};

/** The retired "Senior Music Connection" workspace: exported and imported as history, never synced. */
export const LEGACY_WORKSPACE_ID = process.env.MONDAY_LEGACY_WORKSPACE_ID || "";
export const LEGACY_BOARDS = {
  gigs: "5834314429", // Gig Tracker (old)
  clientAgreements: "5940969562",
  musicianAgreements: "5941083759",
  applications: "6272137949", // Musician Applications (old)
  bookingRequests: "6272152836", // Booking Request Form (old)
} as const;

// ───────────────────────── Column ids ─────────────────────────

export const ENTERTAINER = {
  status: "status", // Need Info / Active / Not Active / DO NOT USE / Select Status
  phone: "text_mktska84",
  email: "email_mktsxzjg",
  preferredContact: "dropdown_mktsk0h7",
  address: "text_mktsbqfz",
  city: "text_mkts1cpe",
  state: "text_mktszt6t",
  zip: "text_mktsz3je",
  birthdayMonth: "text_mkts9cbn",
  emergencyName: "text_mktsj4j7",
  emergencyPhone: "text_mkts7v9d",
  participation: "dropdown_mkts54de", // Performer / Music Therapist / Other
  participationOther: "text_mktshy5y",
  travel: "dropdown_mktsb1vd",
  region: "dropdown_mktsx0sj",
  groupSize: "numeric_mktseyza",
  groupName: "text_mktscdf",
  instruments: "text_mktsd391",
  genre: "text_mktskzdj",
  equipment: "text_mkts9g9k",
  audiences: "dropdown_mktsfzcb",
  themes: "dropdown_mkts6pqk",
  pay: "text_mktss35w",
  experience: "long_text_mkts5jmk",
  bio: "long_text_mktsc42p",
  headshot: "file_mkts4smm",
  promo: "file_mktswgmv",
} as const;

export const CLIENT = {
  status: "status", // Prospect / Active / Inactive / Select Status
  requests: "board_relation_mktt5eds",
  gigs: "board_relation_mktt51r6",
  contactName: "text_mktt1yx9",
  contactPhone: "text_mkttvbdb",
  address: "text_mkttsn8c",
  city: "text_mktt37xw",
  state: "text_mktttqtb",
  zip: "text_mkttahat",
  audienceType: "dropdown_mktt6ye6",
  audienceSize: "dropdown_mkttc583",
  email: "email_mkvnhj8v",
  notes: "text_mkvn66m0",
  facilityPhone: "phone_mkvnrcnw",
} as const;

export const REQUEST = {
  reviewStatus: "status", // In Review / Approved / Declined / Past Booking / Placeholder / New / CANCELED / DUPLICATE / TEST
  bookedBefore: "single_select4pd8jji",
  multipleSessions: "single_selectyzksmhx",
  client: "board_relation_mkttfh0w",
  clientAlt: "board_relation_mkwa1vzp",
  address: "short_textqimupyvk",
  city: "short_textn1m0r9nz",
  state: "short_text3ro7n864",
  zip: "short_textgwzwdd52",
  contactName: "short_text1wl94ewm",
  contactPhone: "short_textcw2s25yz",
  contactEmail: "emailih75pu2u",
  serviceType: "single_selectim14xku",
  serviceOther: "short_text7sc1hgiz",
  requestedEntertainer: "short_textnpe0vs91",
  location: "single_selecty6awfka",
  locationOther: "short_text6gyi3jhn",
  attendance: "single_selectuzmwdex",
  occasion: "short_text7ofmybfs",
  performanceType: "single_selecthcgol1p",
  audienceType: "single_select09g8yjl",
  audienceCategory: "multi_selectxx7r5g24",
  date: "datewhydl1a4",
  time: "short_textrrbdwmfq",
  earlyArrival: "single_select8di78a8",
  arrival: "long_texths542dez",
  special: "long_textqck65nau",
  budget: "short_textq70sctbj",
  recurringEmail: "emailyqexeplf",
} as const;

export const GIG = {
  dateMirror: "lookup_mkttrrfd",
  eventId: "pulse_id_mkzmenwt",
  timeMirror: "lookup_mkttnwsy",
  sourceRequest: "board_relation_mkttv370",
  client: "board_relation_mkttedhh",
  entertainer: "board_relation_mkttvbqa",
  entertainerEmail: "email_mkv1vn12",
  facilityEmail: "email_mkv1paj2",
  sendAgreements: "color_mktt38sy",
  agreementStatus: "color_mkv1awxa",
  entertainerFee: "numeric_mm047wyq",
  facilityBudget: "numeric_mm04whx8",
  earlyArrival: "dropdown_mktt669f",
  audienceType: "dropdown_mktt6mas",
  attendance: "dropdown_mktte6qn",
  special: "long_text_mkttsvp",
  amountCharged: "numeric_mkv1v494",
  facilityBilled: "status",
  entertainerPaid: "color_mkttyy7k",
  confirmDate: "date_mkv12pf3",
  searchFollowUp: "color_mm5n5kt7",
  searchStart: "date_mm5n4pgb",
  cancel: "color_mm1y3vsd",
  cancelledBy: "color_mm1y267q",
  cancelReason: "text_mm1ytycn",
  sendCancellation: "color_mm1y2cg4",
} as const;

export const FACILITY_FEEDBACK = {
  eventId: "short_text10mb6mk7",
  performerType: "multi_selectgn32ylty",
  rating: "rating6r3o2lft",
  enjoyed: "long_textui0qnv6l",
  recommend: "single_selectw060ps1",
  testimonial: "single_selectmiso1yq",
  comments: "long_textsggtc5tr",
  date: "date9jojlzu3",
} as const;

export const ENTERTAINER_FEEDBACK = {
  eventId: "short_text57zf5van",
  date: "datevhk0o5p6",
  performerType: "single_selecthgtwwt3",
  rating: "rating3e8heu5t",
  enjoyed: "long_texttjmdbgdu",
  testimonial: "single_selectrr4vizq",
  comments: "long_text3ry8kwbe",
} as const;

export const APPLICATION = {
  reviewStatus: "status", // On Hold / Approved / Denied / New
  date: "date4",
  email: "email6ao6vlty",
  phone: "short_textanhh2ng9",
  preferredContact: "single_selectafd9bjb",
  address: "short_textsaoh81vj",
  city: "short_texth50fwfnu",
  state: "short_textn1b8tmt5",
  zip: "short_textrti3g63t",
  birthdayMonth: "short_textul1rompc",
  emergencyName: "short_textqrs85fwx",
  emergencyPhone: "short_texte62e9g9d",
  participation: "multi_selectx8rj8wyb",
  participationOther: "short_text1bifh495",
  travel: "multi_select5rd2e51r",
  region: "single_selectwxp8r5g",
  genre: "long_textg7wf0eth",
  themes: "multi_selectxe5gklrx",
  groupName: "short_textcps9ntom",
  instruments: "short_textd2tbrtxp",
  groupSize: "numberatwcezmp",
  audiences: "multi_selectqr3it0bl",
  equipment: "long_text9m91vcd7",
  pay: "short_textioeytovv",
  experience: "long_textp67tjfxh",
  bio: "long_textn0k7bdj6",
  headshot: "fileivdw3o8o",
  promo: "fileuavnx5do",
} as const;
