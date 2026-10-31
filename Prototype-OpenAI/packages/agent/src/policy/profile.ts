/** Demo limits selected by the v2.2 contract; these are not live carrier parameters. */
export const profile = {
  policy_version: "demo-two-assessment-v2",
  maximum_attempts: 3,
  maximum_buyer_questions: 1,
  no_reply_final_selection: 1,
  reply_final_selection: 2,
} as const;
