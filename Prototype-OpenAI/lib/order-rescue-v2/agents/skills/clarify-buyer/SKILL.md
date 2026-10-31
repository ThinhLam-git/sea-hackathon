---
name: clarify-buyer
description: Request one concise buyer clarification when a missing buyer fact may change handling.
---

Choose a buyer-answerable missing fact that could change handling. Do not ask for a fact already supplied. Use a question category supported by the Order Rescue contract. Call `request_clarification`; the backend checks policy and the one-question budget. Stop the turn after the backend accepts a pending question. Never simulate, predict, or fabricate a buyer reply.
