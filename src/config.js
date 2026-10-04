const COHOST_QUOTA_ROLE_ID = process.env.COHOST_QUOTA_ROLE_ID || "1467905801069789429";

module.exports = {
  timezone: process.env.TIMEZONE || "Asia/Dubai",
  cohostQuotaRoleId: COHOST_QUOTA_ROLE_ID,
  staffRoleIds: (process.env.STAFF_ROLE_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),

  // The bot checks these names from highest priority to lowest priority.
  // Rename them here if the Discord role names differ.
  roleRequirements: [
    {
      name: "Supreme Commander of Crimson Imperium",
      requirements: [
        { type: "reform", label: "HICOM Reforms", target: 1 },
        { type: "event", eventTypes: ["HICOM"], label: "HICOM Event", target: 1 }
      ]
    },
    {
      name: "High Marshal Of The Crimson Imperium",
      requirements: [
        { type: "event", eventTypes: ["Leadership", "HICOM"], label: "Leadership/HICOM Event", target: 1 },
        { type: "duty", dutyTypes: ["Leadership"], label: "Leadership Duties", target: 1 }
      ]
    },
    {
      name: "Crimson Imperium War Council",
      requirements: [
        { type: "event", eventTypes: ["HICOM"], label: "HICOM Events", target: 2 },
        { type: "duty", dutyTypes: ["Leadership"], label: "Leadership Duties", target: 1 }
      ]
    },
    {
      name: "HICOM",
      requirements: [
        { type: "event", eventTypes: ["HICOM"], label: "HICOM Event", target: 1 },
        { type: "event", eventTypes: ["OA", "REC"], label: "OA / REC Phase", target: 1 },
        { type: "duty", dutyTypes: ["HICOM"], label: "HICOM Duties", target: 1 }
      ]
    },
    {
      name: "MIDCOM",
      requirements: [
        { type: "event", eventTypes: ["Tryout"], label: "Tryout", target: 1 },
        { type: "event", eventTypes: ["CT", "FT", "PT"], label: "Main Trainings", target: 2 },
        { type: "event", eventTypes: ["Raid"], label: "Raids", target: 2 }
      ]
    },
    {
      name: "LOWCOM",
      requirements: [
        { type: "event", eventTypes: ["Raid"], label: "Raids", target: 3, countAttendance: true },
        { type: "event", eventTypes: ["CT", "FT", "PT"], label: "Main Training", target: 1 }
      ]
    },
    {
      name: "Recruit",
      requirements: [
        { type: "department", label: "Department Join", target: 1 }
      ]
    },
    {
      name: "Junior Operative",
      requirements: [
        { type: "department", label: "Department Join", target: 1 }
      ]
    }
  ]
};
