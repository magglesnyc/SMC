import { describe, expect, it } from "vitest";
import { extractGenres, mapAudienceTag, mapEntertainerStatus, normaliseState, parseAttendance, parseEmails, parseMoney, parseTimeRange, parseTravelMiles, splitName } from "../lib/monday/parse";

describe("parseTimeRange", () => {
  it("reads explicit ranges as written on the boards", () => {
    expect(parseTimeRange("6:30 to 7:30 pm")).toEqual({ start: "18:30", durationMinutes: 60, hasEnd: true });
    expect(parseTimeRange("2 PM - 3 PM")).toEqual({ start: "14:00", durationMinutes: 60, hasEnd: true });
    expect(parseTimeRange("10am-12pm")).toEqual({ start: "10:00", durationMinutes: 120, hasEnd: true });
    expect(parseTimeRange("1:00 - 2:00 p.m.")).toEqual({ start: "13:00", durationMinutes: 60, hasEnd: true });
    expect(parseTimeRange("11-1pm")).toEqual({ start: "11:00", durationMinutes: 120, hasEnd: true });
  });
  it("assumes daytime for unlabelled hours", () => {
    expect(parseTimeRange("2:30-3:30")).toEqual({ start: "14:30", durationMinutes: 60, hasEnd: true });
    expect(parseTimeRange("10:00-11:00")).toEqual({ start: "10:00", durationMinutes: 60, hasEnd: true });
  });
  it("falls back to a default duration with only a start", () => {
    expect(parseTimeRange("6:30pm")).toEqual({ start: "18:30", durationMinutes: 60, hasEnd: false });
  });
  it("returns null for TBD and nonsense", () => {
    expect(parseTimeRange("TBD")).toBeNull();
    expect(parseTimeRange("")).toBeNull();
    expect(parseTimeRange("afternoon")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("reads fees and structures", () => {
    expect(parseMoney("$200 per hour")).toEqual({ amount: 200, structure: "PER_HOUR", approximate: false });
    expect(parseMoney("$500 and up")).toEqual({ amount: 500, structure: "PER_EVENT", approximate: true });
    expect(parseMoney("150")).toEqual({ amount: 150, structure: "PER_EVENT", approximate: false });
    expect(parseMoney("$75/hr (some choose to pay me as much as $125")).toMatchObject({ amount: 75, structure: "PER_HOUR" });
  });
  it("returns null for TBD / negotiable without a number", () => {
    expect(parseMoney("TBD")).toBeNull();
    expect(parseMoney("negotiable")).toBeNull();
  });
});

describe("parseTravelMiles", () => {
  it("handles the 20 variants on the entertainer list", () => {
    expect(parseTravelMiles("25 miles")).toBe(25);
    expect(parseTravelMiles("50+ miles")).toBe(50);
    expect(parseTravelMiles("70 mile radius")).toBe(70);
    expect(parseTravelMiles("75 miles one way")).toBe(75);
    expect(parseTravelMiles("1 hour")).toBe(45);
    expect(parseTravelMiles("30 to 40 minutes")).toBe(30);
    expect(parseTravelMiles("OPEN")).toBe(150);
    expect(parseTravelMiles("25 miles, 10 miles")).toBe(25);
    expect(parseTravelMiles("")).toBeNull();
  });
});

describe("small parsers", () => {
  it("attendance takes the upper bound", () => {
    expect(parseAttendance("1-10")).toBe(10);
    expect(parseAttendance("30+")).toBe(30);
    expect(parseAttendance("")).toBeNull();
  });
  it("splits names and strips group suffixes", () => {
    expect(splitName("Bob Claymier - Museaic")).toEqual({ firstName: "Bob", lastName: "Claymier" });
    expect(splitName("Acoustic Junior")).toEqual({ firstName: "Acoustic", lastName: "Junior" });
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
  it("normalises states and multi-address email cells", () => {
    expect(normaliseState("Ohio")).toBe("OH");
    expect(normaliseState("oh")).toBe("OH");
    expect(parseEmails("a@x.com; b@x.com; c@x.com - a@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });
  it("maps labels", () => {
    expect(mapEntertainerStatus("DO NOT USE")).toBe("SUSPENDED");
    expect(mapEntertainerStatus("Select Status")).toBe("REVIEW");
    expect(mapAudienceTag("Independant Living")).toBe("independent-living");
    expect(extractGenres("Classic Country, some 60's oldies and gospel hymns")).toEqual(expect.arrayContaining(["country", "oldies", "gospel", "hymns"]));
  });
});
