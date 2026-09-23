import { describe, expect, it } from "vitest";
import { computeRelationshipScore, isFamiliarShelfEligible } from "./score.js";

describe("familiarity score", () => {
  it("scores favorite-only as shelf-eligible", () => {
    const { score, status } = computeRelationshipScore({
      completedInteractions: 0,
      lastInteractionAt: null,
      favorite: true,
      weights: {
        completed: 10,
        repeatBonus: 20,
        recencyMax: 30,
        recencyHalfLifeDays: 30,
        favorite: 25,
        regularThreshold: 5,
        vipThreshold: 15,
      },
    });
    expect(status).toBe("NEW");
    expect(score).toBe(25);
    expect(
      isFamiliarShelfEligible({ completedInteractions: 0, favorite: true, hiddenByUser: false }),
    ).toBe(true);
  });

  it("marks VIP at threshold", () => {
    const { status } = computeRelationshipScore({
      completedInteractions: 15,
      lastInteractionAt: new Date(),
      favorite: false,
      weights: {
        completed: 10,
        repeatBonus: 20,
        recencyMax: 0,
        recencyHalfLifeDays: 30,
        favorite: 25,
        regularThreshold: 5,
        vipThreshold: 15,
      },
    });
    expect(status).toBe("VIP");
  });

  it("requires 2 completes or favorite for shelf", () => {
    expect(
      isFamiliarShelfEligible({ completedInteractions: 1, favorite: false, hiddenByUser: false }),
    ).toBe(false);
    expect(
      isFamiliarShelfEligible({ completedInteractions: 2, favorite: false, hiddenByUser: false }),
    ).toBe(true);
  });
});
