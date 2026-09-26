import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  auditLogs,
  experienceCities,
  experienceInterests,
  experienceOccurrences,
  experienceOrganizers,
  experienceOrganizerMembers,
  experienceSaves,
  experienceSources,
  userIdentities,
  experienceVenues,
  experiences,
  findPossibleDuplicate,
  foldText,
  homeContext,
  normalizePastedCaption,
  occurrenceInWindow,
  parseExperienceImport,
  priceErrors,
  renderExperienceBody,
  selectHomeExperiences,
  filterWindow,
  type CatalogExperience,
  type ExperienceImport,
  type PickiDb,
  type WhenFilter,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { normalizePhone } from "../../shared/crypto.js";
import { PICKI_DB } from "../../shared/tokens.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import type { experiencePatchSchema } from "./dto.js";
import type { z } from "zod";

type OpenCity = { code: string; label: string; slug: string };
type Patch = z.infer<typeof experiencePatchSchema>;
type DbTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];
type SubmissionInput = {
  organizerName: string;
  websiteUrl?: string | null;
  title: string;
  summary: string;
  whyGo: string;
  body?: string;
  venueName: string;
  venueAddress?: string | null;
  startAt: string;
  endAt?: string | null;
  priceMode: "FREE" | "PRICED" | "UNKNOWN";
  priceFrom?: number | null;
  priceTo?: number | null;
  priceNote?: string | null;
  categories: string[];
  audiences: string[];
  bookingUrl?: string | null;
  imageUrls?: string[];
};

const LIVE_STATUSES = ["DRAFT", "PENDING", "PUBLISHED"] as const;
const PRICE_UNDER = 200_000;
const PRICE_HIGH = 500_000;

@Injectable()
export class ExperiencesService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  async preview(userId: string, items: unknown[]) {
    const open = await this.openCityCodes();
    const catalogs = await this.catalogByCity();
    const candidates = items.map((item, index) => this.inspect(item, catalogs, open, index));
    this.analytics.trackFireAndForget(
      userId,
      items.length === 1 ? "experience_import_single" : "experience_import_batch",
      { properties: { count: items.length } },
    );
    if (candidates.some((row) => row.errors.length > 0)) {
      this.analytics.trackFireAndForget(userId, "experience_import_validation_error", {
        properties: { count: candidates.filter((row) => row.errors.length > 0).length },
      });
    }
    if (candidates.some((row) => row.duplicate)) {
      this.analytics.trackFireAndForget(userId, "experience_duplicate_warning", {
        properties: { count: candidates.filter((row) => row.duplicate).length },
      });
    }
    return { candidates };
  }

  async commit(
    userId: string,
    items: {
      decision: "skip" | "import" | "import_anyway" | "attach_source";
      experience: unknown;
    }[],
  ) {
    const open = await this.openCityCodes();
    const catalogs = await this.catalogByCity();
    const created: { index: number; id: string }[] = [];
    const attached: { index: number; id: string }[] = [];
    const skipped: number[] = [];
    const errors: { index: number; message: string }[] = [];

    for (const [index, item] of items.entries()) {
      if (item.decision === "skip") {
        skipped.push(index);
        continue;
      }
      const parsed = parseExperienceImport(item.experience, open);
      if (!parsed.value || parsed.errors.length > 0) {
        errors.push({
          index,
          message: parsed.errors[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        continue;
      }
      const duplicate = findPossibleDuplicate(
        parsed.value,
        catalogs.get(parsed.value.city) ?? [],
      );
      if (item.decision === "attach_source") {
        if (!duplicate) {
          errors.push({ index, message: "Không thấy bản đã có để gắn nguồn" });
          continue;
        }
        try {
          await this.attachSource(userId, duplicate.id, parsed.value);
          attached.push({ index, id: duplicate.id });
        } catch (err) {
          errors.push({
            index,
            message: err instanceof Error ? err.message : "Không gắn được nguồn",
          });
        }
        continue;
      }
      if (duplicate && item.decision !== "import_anyway") {
        errors.push({
          index,
          message: `Có thể trùng “${duplicate.title}”. Chọn Bỏ qua, Vẫn import, hoặc Gắn thêm nguồn.`,
        });
        continue;
      }
      try {
        const id = await this.insertDraft(userId, parsed.value);
        created.push({ index, id });
        const bucket = catalogs.get(parsed.value.city) ?? [];
        bucket.push(this.asCatalog(id, parsed.value));
        catalogs.set(parsed.value.city, bucket);
        this.analytics.trackFireAndForget(userId, "experience_draft_created", {
          properties: { experienceId: id },
        });
      } catch (err) {
        errors.push({
          index,
          message: err instanceof Error ? err.message : "Không tạo được draft",
        });
      }
    }

    return { created, attached, skipped, errors };
  }

  async listAdmin(status?: string) {
    const rows = await this.db.select().from(experiences).orderBy(experiences.createdAt);
    const filtered = status ? rows.filter((row) => row.status === status) : rows;
    const cards = await this.hydrate(filtered.map((row) => row.id));
    return { experiences: cards };
  }

  async getAdmin(id: string) {
    const card = await this.hydrateOne(id, true);
    if (!card) throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm");
    return card;
  }

  async update(userId: string, id: string, patch: Patch) {
    const current = await this.requireExperience(id);
    const priceMode = patch.priceMode ?? current.priceMode;
    const priceFrom = patch.priceFrom !== undefined ? patch.priceFrom : current.priceFromVnd;
    const priceTo = patch.priceTo !== undefined ? patch.priceTo : current.priceToVnd;
    const normalizedFrom = priceMode === "PRICED" ? priceFrom : null;
    const normalizedTo = priceMode === "PRICED" ? priceTo : null;
    const issues = priceErrors(
      priceMode as "FREE" | "PRICED" | "UNKNOWN",
      normalizedFrom,
      normalizedTo,
    );
    if (priceMode === "PRICED" && normalizedFrom == null) {
      throw new PickiError("VALIDATION_ERROR", "PRICED cần giá từ");
    }
    if (issues.length > 0) {
      throw new PickiError("VALIDATION_ERROR", issues[0]?.message ?? "Giá không hợp lệ");
    }

    let organizerId = current.organizerId;
    if (patch.organizerName || patch.organizerWebsiteUrl !== undefined) {
      const organizer = await this.db
        .select()
        .from(experienceOrganizers)
        .where(eq(experienceOrganizers.id, current.organizerId))
        .limit(1);
      const name = patch.organizerName ?? organizer[0]?.name ?? "";
      await this.db
        .update(experienceOrganizers)
        .set({
          name,
          nameFold: foldText(name),
          websiteUrl:
            patch.organizerWebsiteUrl !== undefined
              ? patch.organizerWebsiteUrl
              : organizer[0]?.websiteUrl,
          updatedAt: new Date(),
        })
        .where(eq(experienceOrganizers.id, current.organizerId));
      organizerId = current.organizerId;
    }

    if (
      patch.venueName ||
      patch.venueAddress !== undefined ||
      patch.venueLat !== undefined ||
      patch.venueLng !== undefined
    ) {
      const venue = await this.db
        .select()
        .from(experienceVenues)
        .where(eq(experienceVenues.id, current.venueId))
        .limit(1);
      const name = patch.venueName ?? venue[0]?.name ?? "";
      const address = patch.venueAddress !== undefined ? patch.venueAddress : venue[0]?.address;
      await this.db
        .update(experienceVenues)
        .set({
          name,
          nameFold: foldText(name),
          address,
          addressFold: foldText(address ?? ""),
          lat: patch.venueLat !== undefined ? patch.venueLat : venue[0]?.lat,
          lng: patch.venueLng !== undefined ? patch.venueLng : venue[0]?.lng,
          updatedAt: new Date(),
        })
        .where(eq(experienceVenues.id, current.venueId));
    }

    if (patch.occurrences) {
      const parsed = patch.occurrences.map((item) => {
        const start = Date.parse(item.startAt);
        const end = item.endAt ? Date.parse(item.endAt) : null;
        if (Number.isNaN(start) || (end != null && Number.isNaN(end))) {
          throw new PickiError("VALIDATION_ERROR", "Suất diễn không phải thời điểm hợp lệ");
        }
        if (end != null && end < start) {
          throw new PickiError("VALIDATION_ERROR", "end_at phải sau start_at");
        }
        return { startAt: new Date(start), endAt: end == null ? null : new Date(end) };
      });
      await this.db
        .delete(experienceOccurrences)
        .where(eq(experienceOccurrences.experienceId, id));
      await this.db.insert(experienceOccurrences).values(
        parsed.map((item) => ({
          experienceId: id,
          startAt: item.startAt,
          endAt: item.endAt,
        })),
      );
    }

    const title = patch.title ?? current.title;
    await this.db
      .update(experiences)
      .set({
        title,
        titleFold: foldText(title),
        summary: patch.summary ?? current.summary,
        whyGo: patch.whyGo ?? current.whyGo,
        body: patch.body !== undefined ? normalizePastedCaption(patch.body ?? "") || null : current.body,
        priceMode,
        priceFromVnd: normalizedFrom,
        priceToVnd: normalizedTo,
        priceNote: patch.priceNote !== undefined ? patch.priceNote : current.priceNote,
        ageNote: patch.ageNote !== undefined ? patch.ageNote : current.ageNote,
        language: patch.language !== undefined ? patch.language : current.language,
        durationMinutes:
          patch.durationMinutes !== undefined ? patch.durationMinutes : current.durationMinutes,
        categories: patch.categories ?? current.categories,
        audiences: patch.audiences ?? current.audiences,
        bookingUrl: patch.bookingUrl !== undefined ? patch.bookingUrl : current.bookingUrl,
        coverUrl: patch.coverUrl !== undefined ? patch.coverUrl : current.coverUrl,
        mediaStatus: patch.mediaStatus ?? current.mediaStatus,
        soldOut: patch.soldOut ?? current.soldOut,
        featuredRank: patch.featuredRank !== undefined ? patch.featuredRank : current.featuredRank,
        bookingDeadline:
          patch.bookingDeadline !== undefined
            ? patch.bookingDeadline
              ? new Date(patch.bookingDeadline)
              : null
            : current.bookingDeadline,
        registrationDeadline:
          patch.registrationDeadline !== undefined
            ? patch.registrationDeadline
              ? new Date(patch.registrationDeadline)
              : null
            : current.registrationDeadline,
        organizerId,
        updatedAt: new Date(),
      })
      .where(eq(experiences.id, id));

    await this.audit(userId, "EXPERIENCE_UPDATE", id, {});
    return this.getAdmin(id);
  }

  async publish(userId: string, id: string) {
    const current = await this.requireExperience(id);
    if (current.status !== "DRAFT" && current.status !== "PENDING") {
      throw new PickiError("STATE_TRANSITION_INVALID", "Chỉ draft hoặc pending mới được xuất bản");
    }
    const now = new Date();
    await this.db
      .update(experiences)
      .set({
        status: "PUBLISHED",
        publishedAt: now,
        publishedBy: userId,
        updatedAt: now,
      })
      .where(eq(experiences.id, id));
    await this.audit(userId, "EXPERIENCE_PUBLISH", id, {});
    this.analytics.trackFireAndForget(userId, "experience_publish", {
      properties: { experienceId: id },
    });
    return this.getAdmin(id);
  }

  async attachOrganizerMember(actorId: string, organizerId: string, phone: string) {
    const organizer = await this.db
      .select({ id: experienceOrganizers.id })
      .from(experienceOrganizers)
      .where(eq(experienceOrganizers.id, organizerId))
      .limit(1);
    if (!organizer[0]) throw new PickiError("NOT_FOUND", "Không thấy đơn vị tổ chức");
    const normalized = normalizePhone(phone);
    const identity = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(
        and(eq(userIdentities.provider, "PHONE"), eq(userIdentities.externalUserId, normalized)),
      )
      .limit(1);
    const memberUserId = identity[0]?.userId;
    if (!memberUserId) throw new PickiError("NOT_FOUND", "Không thấy tài khoản với số này");
    await this.db
      .insert(experienceOrganizerMembers)
      .values({ organizerId, userId: memberUserId })
      .onConflictDoNothing({
        target: [experienceOrganizerMembers.organizerId, experienceOrganizerMembers.userId],
      });
    await this.audit(actorId, "EXPERIENCE_ORGANIZER_ATTACH", organizerId, {
      userId: memberUserId,
      phone: normalized,
    });
    return { members: await this.organizerPhones(organizerId) };
  }

  async reject(userId: string, id: string) {
    const current = await this.requireExperience(id);
    if (current.status === "REJECTED") return this.getAdmin(id);
    await this.db
      .update(experiences)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(experiences.id, id));
    await this.audit(userId, "EXPERIENCE_REJECT", id, { from: current.status });
    this.analytics.trackFireAndForget(userId, "experience_reject", {
      properties: { experienceId: id },
    });
    return this.getAdmin(id);
  }

  async requireOpenCity(slug: string): Promise<OpenCity> {
    const rows = await this.db
      .select()
      .from(experienceCities)
      .where(eq(experienceCities.slug, slug))
      .limit(1);
    const city = rows[0];
    if (!city?.enabled) throw new PickiError("NOT_FOUND", "Thành phố chưa mở");
    return { code: city.code, label: city.label, slug: city.slug };
  }

  async listPublic(
    city: OpenCity,
    query: {
      when?: WhenFilter;
      price?: string;
      audience?: string;
      category?: string;
      q?: string;
      saved?: boolean;
      interested?: boolean;
    },
    userId: string | null,
  ) {
    const now = new Date();
    const cards = await this.publishedCards(city.code);
    let rows = cards.filter((card) => card.occurrences.length > 0);
    if (query.when) {
      const window = filterWindow(query.when, now);
      rows = rows.filter((card) =>
        card.occurrences.some((item) => occurrenceInWindow(new Date(item.startAt), window, now)),
      );
    }
    if (query.price === "free") rows = rows.filter((card) => card.priceMode === "FREE");
    if (query.price === "under_200") {
      rows = rows.filter(
        (card) => card.priceMode === "PRICED" && (card.priceFromVnd ?? 0) < PRICE_UNDER,
      );
    }
    if (query.price === "mid") {
      rows = rows.filter((card) => {
        const from = card.priceFromVnd ?? -1;
        return card.priceMode === "PRICED" && from >= PRICE_UNDER && from < PRICE_HIGH;
      });
    }
    if (query.price === "high") {
      rows = rows.filter(
        (card) => card.priceMode === "PRICED" && (card.priceFromVnd ?? 0) >= PRICE_HIGH,
      );
    }
    if (query.audience) rows = rows.filter((card) => card.audiences.includes(query.audience!));
    if (query.category) rows = rows.filter((card) => card.categories.includes(query.category!));
    if (query.q?.trim()) {
      const needle = foldText(query.q);
      rows = rows.filter((card) => {
        const hay = foldText(
          `${card.title} ${card.summary} ${card.venue.name} ${card.organizer.name}`,
        );
        return hay.includes(needle);
      });
    }
    if (query.saved) {
      if (!userId) rows = [];
      else {
        const saves = await this.db
          .select({ experienceId: experienceSaves.experienceId })
          .from(experienceSaves)
          .where(eq(experienceSaves.userId, userId));
        const ids = new Set(saves.map((row) => row.experienceId));
        rows = rows.filter((card) => ids.has(card.id));
      }
    }
    if (query.interested) {
      if (!userId) rows = [];
      else {
        const interests = await this.db
          .select({ experienceId: experienceInterests.experienceId })
          .from(experienceInterests)
          .where(eq(experienceInterests.userId, userId));
        const ids = new Set(interests.map((row) => row.experienceId));
        rows = rows.filter((card) => ids.has(card.id));
      }
    }
    rows.sort((a, b) => nextStart(a.occurrences, now) - nextStart(b.occurrences, now));
    const marked = await this.withFlags(rows, userId);
    return { city, experiences: marked.map(publicCard) };
  }

  async getPublic(city: OpenCity, id: string, userId: string | null) {
    const card = await this.hydrateOne(id, false);
    if (!card || card.status !== "PUBLISHED" || card.city.code !== city.code) {
      throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm");
    }
    const [marked] = await this.withFlags([card], userId);
    return publicDetail(marked!);
  }

  async homeCard(city: OpenCity) {
    const now = new Date();
    const context = homeContext(now);
    const cards = await this.publishedCards(city.code);
    const fitting = cards
      .map((card) => {
        const starts = card.occurrences
          .map((item) => new Date(item.startAt))
          .filter((start) => occurrenceInWindow(start, context.window, now))
          .sort((a, b) => a.getTime() - b.getTime());
        if (starts.length === 0) return null;
        return { card, startAt: starts[0]! };
      })
      .filter((item): item is { card: AdminCard; startAt: Date } => item != null);

    const selected = selectHomeExperiences(
      fitting.map((item) => ({
        id: item.card.id,
        featuredRank: item.card.featuredRank,
        startAt: item.startAt,
        card: item.card,
      })),
      3,
    );
    if (selected.source === "empty") return { card: null };
    return {
      card: {
        copy: context.copy,
        when: context.when,
        source: selected.source,
        city,
        experiences: selected.items.map((item) => publicCard(item.card)),
      },
    };
  }

  async save(userId: string, id: string, saveFor: string | null) {
    await this.requirePublished(id);
    await this.db
      .insert(experienceSaves)
      .values({ userId, experienceId: id, saveFor })
      .onConflictDoUpdate({
        target: [experienceSaves.userId, experienceSaves.experienceId],
        set: { saveFor },
      });
    this.analytics.trackFireAndForget(userId, "experience_save", {
      properties: { experienceId: id },
    });
    return { ok: true };
  }

  async unsave(userId: string, id: string) {
    await this.db
      .delete(experienceSaves)
      .where(and(eq(experienceSaves.userId, userId), eq(experienceSaves.experienceId, id)));
    return { ok: true };
  }

  async interest(userId: string, id: string) {
    const card = await this.requirePublished(id);
    const remindAt = remindAtFor(
      card.occurrences.map((item) => new Date(item.startAt)),
      new Date(),
    );
    await this.db
      .insert(experienceInterests)
      .values({ userId, experienceId: id, remindAt, notifiedAt: null })
      .onConflictDoUpdate({
        target: [experienceInterests.userId, experienceInterests.experienceId],
        set: { remindAt, notifiedAt: null },
      });
    this.analytics.trackFireAndForget(userId, "experience_interest", {
      properties: { experienceId: id },
    });
    return { ok: true };
  }

  async uninterest(userId: string, id: string) {
    await this.db
      .delete(experienceInterests)
      .where(
        and(eq(experienceInterests.userId, userId), eq(experienceInterests.experienceId, id)),
      );
    return { ok: true };
  }

  async bookingClick(userId: string, id: string) {
    const card = await this.requirePublished(id);
    if (!card.bookingUrl) {
      throw new PickiError("VALIDATION_ERROR", "Trải nghiệm này chưa có link đặt chỗ");
    }
    this.analytics.trackFireAndForget(userId, "ticket_outbound_click", {
      properties: { experienceId: id },
    });
    return { url: card.bookingUrl };
  }

  async listMine(userId: string, city: OpenCity) {
    const rows = await this.db
      .select({ id: experiences.id })
      .from(experiences)
      .where(and(eq(experiences.createdBy, userId), eq(experiences.city, city.code)));
    const cards = await this.hydrate(rows.map((row) => row.id));
    return { experiences: cards };
  }

  async submit(userId: string, city: OpenCity, input: SubmissionInput) {
    const id = await this.writeSubmission(userId, null, input, city.code);
    this.analytics.trackFireAndForget(userId, "experience_submit", {
      properties: { experienceId: id },
    });
    return this.ownerCard(userId, id);
  }

  async updateSubmission(userId: string, city: OpenCity, id: string, input: SubmissionInput) {
    await this.writeSubmission(userId, id, input, city.code);
    return this.ownerCard(userId, id);
  }

  private async writeSubmission(
    userId: string,
    existingId: string | null,
    input: SubmissionInput,
    cityCode: string,
  ) {
    const start = Date.parse(input.startAt);
    const end = input.endAt ? Date.parse(input.endAt) : null;
    if (Number.isNaN(start) || (end != null && Number.isNaN(end)) || (end != null && end < start)) {
      throw new PickiError("VALIDATION_ERROR", "Suất diễn không hợp lệ");
    }
    const priceFrom = input.priceMode === "PRICED" ? (input.priceFrom ?? null) : null;
    const priceTo = input.priceMode === "PRICED" ? (input.priceTo ?? null) : null;
    const issues = priceErrors(input.priceMode, priceFrom, priceTo);
    if (input.priceMode === "PRICED" && priceFrom == null) {
      throw new PickiError("VALIDATION_ERROR", "PRICED cần giá từ");
    }
    if (issues.length > 0) {
      throw new PickiError("VALIDATION_ERROR", issues[0]?.message ?? "Giá không hợp lệ");
    }
    const images = input.imageUrls ?? [];
    if (images.some((url) => !url.startsWith("/v1/uploads/experiences/"))) {
      throw new PickiError("VALIDATION_ERROR", "Ảnh phải được tải lên Pickee");
    }
    const body = normalizePastedCaption(input.body ?? "");
    const website = input.websiteUrl ?? null;
    const sourceUrl = website || input.bookingUrl || "https://pickee.local/organizer-submit";

    return this.db.transaction(async (tx) => {
      if (existingId) {
        const current = await tx
          .select()
          .from(experiences)
          .where(eq(experiences.id, existingId))
          .limit(1);
        const row = current[0];
        if (!row || row.createdBy !== userId || row.city !== cityCode) {
          throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm của bạn");
        }
        if (row.status !== "PENDING" && row.status !== "REJECTED") {
          throw new PickiError("STATE_TRANSITION_INVALID", "Chỉ sửa được bài đang chờ hoặc bị từ chối");
        }
      }
      const organizerId = await this.claimOrganizer(
        tx,
        userId,
        cityCode,
        input.organizerName,
        website,
      );
      const venueId = await this.findOrCreateVenue(tx, cityCode, {
        name: input.venueName,
        address: input.venueAddress ?? null,
        lat: null,
        lng: null,
      });
      const mediaStatus = images.length > 0 ? "READY" : "PLACEHOLDER";
      const values = {
        title: input.title,
        titleFold: foldText(input.title),
        summary: input.summary,
        whyGo: input.whyGo,
        body: body || null,
        organizerId,
        venueId,
        priceMode: input.priceMode,
        priceFromVnd: priceFrom,
        priceToVnd: priceTo,
        priceNote: input.priceNote ?? null,
        categories: input.categories,
        audiences: input.audiences,
        bookingUrl: input.bookingUrl ?? null,
        coverUrl: images[0] ?? null,
        imageUrls: images,
        mediaStatus,
        status: "PENDING" as const,
        updatedAt: new Date(),
      };
      let id = existingId;
      if (!id) {
        const [created] = await tx
          .insert(experiences)
          .values({ ...values, city: cityCode, createdBy: userId })
          .returning({ id: experiences.id });
        if (!created) throw new Error("Không gửi được bài");
        id = created.id;
        await tx.insert(experienceSources).values({
          experienceId: id,
          sourceUrl,
          sourceName: input.organizerName,
          sourceType: "ORGANIZER",
          importedBy: userId,
        });
        await tx.insert(auditLogs).values({
          actorUserId: userId,
          action: "EXPERIENCE_SUBMIT",
          entityType: "experience",
          entityId: id,
          metadata: { organizerName: input.organizerName },
        });
      } else {
        await tx.update(experiences).set(values).where(eq(experiences.id, id));
      }
      await tx.delete(experienceOccurrences).where(eq(experienceOccurrences.experienceId, id));
      await tx.insert(experienceOccurrences).values({
        experienceId: id,
        startAt: new Date(start),
        endAt: end == null ? null : new Date(end),
      });
      return id;
    });
  }

  private async claimOrganizer(
    tx: DbTx,
    userId: string,
    cityCode: string,
    name: string,
    websiteUrl: string | null,
  ) {
    const nameFold = foldText(name);
    const existing = await tx
      .select({ id: experienceOrganizers.id })
      .from(experienceOrganizers)
      .where(
        and(eq(experienceOrganizers.city, cityCode), eq(experienceOrganizers.nameFold, nameFold)),
      )
      .limit(1);
    let organizerId = existing[0]?.id;
    if (!organizerId) {
      const [created] = await tx
        .insert(experienceOrganizers)
        .values({ city: cityCode, name, nameFold, websiteUrl })
        .returning({ id: experienceOrganizers.id });
      if (!created) throw new Error("Không tạo được đơn vị tổ chức");
      organizerId = created.id;
    } else if (websiteUrl) {
      await tx
        .update(experienceOrganizers)
        .set({ websiteUrl, updatedAt: new Date() })
        .where(eq(experienceOrganizers.id, organizerId));
    }
    const member = await tx
      .select({ id: experienceOrganizerMembers.id })
      .from(experienceOrganizerMembers)
      .where(
        and(
          eq(experienceOrganizerMembers.organizerId, organizerId),
          eq(experienceOrganizerMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member[0]) {
      const others = await tx
        .select({ id: experienceOrganizerMembers.id })
        .from(experienceOrganizerMembers)
        .where(eq(experienceOrganizerMembers.organizerId, organizerId))
        .limit(1);
      const foreign = await tx
        .select({ id: experiences.id })
        .from(experiences)
        .where(
          and(
            eq(experiences.organizerId, organizerId),
            or(isNull(experiences.createdBy), ne(experiences.createdBy, userId)),
          ),
        )
        .limit(1);
      if (others[0] || foreign[0]) {
        throw new PickiError(
          "CONFLICT",
          "Tên đơn vị này đã có người phụ trách. Nhờ admin gắn tài khoản của bạn.",
        );
      }
      await tx.insert(experienceOrganizerMembers).values({ organizerId, userId });
    }
    return organizerId;
  }

  private async ownerCard(userId: string, id: string) {
    const card = await this.hydrateOne(id, true);
    if (!card) throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm");
    return { ...card, bodyBlocks: renderExperienceBody(card.body) };
  }

  private inspect(
    item: unknown,
    catalogs: Map<string, CatalogExperience[]>,
    openCityCodes: string[],
    index: number,
  ) {
    const parsed = parseExperienceImport(item, openCityCodes);
    const duplicate = parsed.value
      ? findPossibleDuplicate(parsed.value, catalogs.get(parsed.value.city) ?? [])
      : null;
    return {
      index,
      errors: parsed.errors,
      experience: parsed.value,
      duplicate,
    };
  }

  private async attachSource(userId: string, experienceId: string, value: ExperienceImport) {
    const existing = await this.db
      .select({ id: experienceSources.id })
      .from(experienceSources)
      .where(
        and(
          eq(experienceSources.experienceId, experienceId),
          eq(experienceSources.sourceUrl, value.sourceUrl),
        ),
      );
    if (existing.length > 0) return;
    await this.db.insert(experienceSources).values({
      experienceId,
      sourceUrl: value.sourceUrl,
      sourceName: value.sourceName,
      sourceType: value.sourceType,
      importedBy: userId,
    });
    await this.db.insert(auditLogs).values({
      actorUserId: userId,
      action: "EXPERIENCE_SOURCE_ATTACH",
      entityType: "experience",
      entityId: experienceId,
      metadata: { sourceUrl: value.sourceUrl, sourceName: value.sourceName },
    });
    this.analytics.trackFireAndForget(userId, "experience_source_attached", {
      properties: { experienceId },
    });
  }

  private async insertDraft(userId: string, value: ExperienceImport): Promise<string> {
    return this.db.transaction(async (tx) => {
      const organizer = await this.findOrCreateOrganizer(tx, value);
      const venue = await this.findOrCreateVenue(tx, value.city, value.venue);
      const [created] = await tx
        .insert(experiences)
        .values({
          title: value.title,
          titleFold: foldText(value.title),
          city: value.city,
          summary: value.summary,
          whyGo: value.whyGo,
          organizerId: organizer,
          venueId: venue,
          priceMode: value.priceMode,
          priceFromVnd: value.priceFrom,
          priceToVnd: value.priceTo,
          priceNote: value.priceNote,
          ageNote: value.ageNote,
          language: value.language,
          durationMinutes: value.durationMinutes,
          categories: value.categories,
          audiences: value.audiences,
          bookingUrl: value.bookingUrl,
          coverUrl: value.media.coverUrl,
          mediaStatus: value.media.mediaStatus,
          bookingDeadline: value.bookingDeadline ? new Date(value.bookingDeadline) : null,
          registrationDeadline: value.registrationDeadline
            ? new Date(value.registrationDeadline)
            : null,
          soldOut: value.soldOut,
          featuredRank: value.featuredRank,
          status: "DRAFT",
          createdBy: userId,
        })
        .returning({ id: experiences.id });
      if (!created) throw new Error("Không tạo được draft");
      await tx.insert(experienceOccurrences).values(
        value.occurrences.map((item) => ({
          experienceId: created.id,
          startAt: new Date(item.startAt),
          endAt: item.endAt ? new Date(item.endAt) : null,
        })),
      );
      await tx.insert(experienceSources).values({
        experienceId: created.id,
        sourceUrl: value.sourceUrl,
        sourceName: value.sourceName,
        sourceType: value.sourceType,
        importedBy: userId,
      });
      await tx.insert(auditLogs).values({
        actorUserId: userId,
        action: "EXPERIENCE_IMPORT",
        entityType: "experience",
        entityId: created.id,
        metadata: { sourceUrl: value.sourceUrl, sourceType: value.sourceType },
      });
      return created.id;
    });
  }

  private async findOrCreateOrganizer(tx: DbTx, value: ExperienceImport): Promise<string> {
    const nameFold = foldText(value.organizer.name);
    const existing = await tx
      .select({ id: experienceOrganizers.id })
      .from(experienceOrganizers)
      .where(and(eq(experienceOrganizers.city, value.city), eq(experienceOrganizers.nameFold, nameFold)))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [created] = await tx
      .insert(experienceOrganizers)
      .values({
        city: value.city,
        name: value.organizer.name,
        nameFold,
        websiteUrl: value.organizer.websiteUrl,
      })
      .returning({ id: experienceOrganizers.id });
    if (!created) throw new Error("Không tạo được organizer");
    return created.id;
  }

  private async findOrCreateVenue(
    tx: DbTx,
    cityCode: string,
    venue: { name: string; address: string | null; lat: number | null; lng: number | null },
  ): Promise<string> {
    const nameFold = foldText(venue.name);
    const addressFold = foldText(venue.address ?? "");
    const existing = await tx
      .select({ id: experienceVenues.id })
      .from(experienceVenues)
      .where(
        and(
          eq(experienceVenues.city, cityCode),
          eq(experienceVenues.nameFold, nameFold),
          eq(experienceVenues.addressFold, addressFold),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [created] = await tx
      .insert(experienceVenues)
      .values({
        city: cityCode,
        name: venue.name,
        nameFold,
        address: venue.address,
        addressFold,
        lat: venue.lat,
        lng: venue.lng,
      })
      .returning({ id: experienceVenues.id });
    if (!created) throw new Error("Không tạo được địa điểm");
    return created.id;
  }

  private asCatalog(id: string, value: ExperienceImport): CatalogExperience {
    return {
      id,
      title: value.title,
      titleFold: foldText(value.title),
      organizerFold: foldText(value.organizer.name),
      venueFold: foldText(value.venue.name),
      venueName: value.venue.name,
      starts: value.occurrences.map((item) => new Date(item.startAt)),
    };
  }

  private async openCityCodes(): Promise<string[]> {
    const rows = await this.db
      .select({ code: experienceCities.code })
      .from(experienceCities)
      .where(eq(experienceCities.enabled, true));
    return rows.map((row) => row.code);
  }

  private async catalogByCity(): Promise<Map<string, CatalogExperience[]>> {
    const rows = await this.db
      .select({
        id: experiences.id,
        city: experiences.city,
        title: experiences.title,
        titleFold: experiences.titleFold,
        organizerFold: experienceOrganizers.nameFold,
        venueFold: experienceVenues.nameFold,
        venueName: experienceVenues.name,
        startAt: experienceOccurrences.startAt,
      })
      .from(experiences)
      .innerJoin(experienceOrganizers, eq(experienceOrganizers.id, experiences.organizerId))
      .innerJoin(experienceVenues, eq(experienceVenues.id, experiences.venueId))
      .leftJoin(experienceOccurrences, eq(experienceOccurrences.experienceId, experiences.id))
      .where(inArray(experiences.status, [...LIVE_STATUSES]));

    const grouped = new Map<string, Map<string, CatalogExperience>>();
    for (const row of rows) {
      const cityRows = grouped.get(row.city) ?? new Map<string, CatalogExperience>();
      const current = cityRows.get(row.id) ?? {
        id: row.id,
        title: row.title,
        titleFold: row.titleFold,
        organizerFold: row.organizerFold,
        venueFold: row.venueFold,
        venueName: row.venueName,
        starts: [],
      };
      if (row.startAt) current.starts.push(row.startAt);
      cityRows.set(row.id, current);
      grouped.set(row.city, cityRows);
    }
    return new Map([...grouped].map(([city, items]) => [city, [...items.values()]]));
  }

  private async publishedCards(cityCode: string): Promise<AdminCard[]> {
    const rows = await this.db
      .select({ id: experiences.id })
      .from(experiences)
      .where(and(eq(experiences.status, "PUBLISHED"), eq(experiences.city, cityCode)));
    return this.hydrate(rows.map((row) => row.id));
  }

  private async hydrate(ids: string[]): Promise<AdminCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(experiences).where(inArray(experiences.id, ids));
    const cityRows = await this.db.select().from(experienceCities);
    const cityByCode = new Map(cityRows.map((row) => [row.code, row]));
    const organizers = await this.db
      .select()
      .from(experienceOrganizers)
      .where(
        inArray(
          experienceOrganizers.id,
          rows.map((row) => row.organizerId),
        ),
      );
    const venues = await this.db
      .select()
      .from(experienceVenues)
      .where(
        inArray(
          experienceVenues.id,
          rows.map((row) => row.venueId),
        ),
      );
    const occurrences = await this.db
      .select()
      .from(experienceOccurrences)
      .where(inArray(experienceOccurrences.experienceId, ids));
    const sources = await this.db
      .select()
      .from(experienceSources)
      .where(inArray(experienceSources.experienceId, ids));
    const organizerById = new Map(organizers.map((row) => [row.id, row]));
    const venueById = new Map(venues.map((row) => [row.id, row]));
    return rows.map((row) => {
      const city = cityByCode.get(row.city);
      return toCard(
        row,
        city ? { code: city.code, label: city.label, slug: city.slug } : { code: row.city, label: row.city, slug: "" },
        organizerById.get(row.organizerId),
        venueById.get(row.venueId),
        occurrences.filter((item) => item.experienceId === row.id),
        sources.filter((item) => item.experienceId === row.id),
      );
    });
  }

  private async hydrateOne(id: string, admin: boolean) {
    const [card] = await this.hydrate([id]);
    if (!card) return null;
    if (!admin) return card;
    return { ...card, organizerMembers: await this.organizerPhones(card.organizer.id) };
  }

  private async organizerPhones(organizerId: string) {
    const rows = await this.db
      .select({
        userId: experienceOrganizerMembers.userId,
        phone: userIdentities.externalUserId,
      })
      .from(experienceOrganizerMembers)
      .leftJoin(
        userIdentities,
        and(
          eq(userIdentities.userId, experienceOrganizerMembers.userId),
          eq(userIdentities.provider, "PHONE"),
        ),
      )
      .where(eq(experienceOrganizerMembers.organizerId, organizerId));
    return rows.map((row) => ({ userId: row.userId, phone: row.phone }));
  }

  private async requireExperience(id: string) {
    const rows = await this.db.select().from(experiences).where(eq(experiences.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm");
    return row;
  }

  private async requirePublished(id: string) {
    const card = await this.hydrateOne(id, false);
    if (!card || card.status !== "PUBLISHED") {
      throw new PickiError("NOT_FOUND", "Không thấy trải nghiệm");
    }
    return card;
  }

  private async withFlags<T extends { id: string }>(rows: T[], userId: string | null) {
    if (!userId || rows.length === 0) {
      return rows.map((row) => ({ ...row, saved: false, interested: false }));
    }
    const ids = rows.map((row) => row.id);
    const saves = await this.db
      .select({ experienceId: experienceSaves.experienceId })
      .from(experienceSaves)
      .where(and(eq(experienceSaves.userId, userId), inArray(experienceSaves.experienceId, ids)));
    const interests = await this.db
      .select({ experienceId: experienceInterests.experienceId })
      .from(experienceInterests)
      .where(
        and(eq(experienceInterests.userId, userId), inArray(experienceInterests.experienceId, ids)),
      );
    const saved = new Set(saves.map((row) => row.experienceId));
    const interested = new Set(interests.map((row) => row.experienceId));
    return rows.map((row) => ({
      ...row,
      saved: saved.has(row.id),
      interested: interested.has(row.id),
    }));
  }

  private async audit(userId: string, action: string, id: string, metadata: Record<string, unknown>) {
    await this.db.insert(auditLogs).values({
      actorUserId: userId,
      action,
      entityType: "experience",
      entityId: id,
      metadata,
    });
  }
}

type AdminCard = ReturnType<typeof toCard>;

function toCard(
  row: typeof experiences.$inferSelect,
  city: OpenCity,
  organizer: typeof experienceOrganizers.$inferSelect | undefined,
  venue: typeof experienceVenues.$inferSelect | undefined,
  occurrences: (typeof experienceOccurrences.$inferSelect)[],
  sources: (typeof experienceSources.$inferSelect)[],
) {
  return {
    id: row.id,
    city,
    title: row.title,
    summary: row.summary,
    whyGo: row.whyGo,
    body: row.body,
    status: row.status,
    priceMode: row.priceMode,
    priceFromVnd: row.priceFromVnd,
    priceToVnd: row.priceToVnd,
    priceNote: row.priceNote,
    ageNote: row.ageNote,
    language: row.language,
    durationMinutes: row.durationMinutes,
    categories: row.categories ?? [],
    audiences: row.audiences ?? [],
    bookingUrl: row.bookingUrl,
    coverUrl: row.coverUrl,
    imageUrls: row.imageUrls ?? [],
    mediaStatus: row.mediaStatus,
    soldOut: row.soldOut,
    featuredRank: row.featuredRank,
    bookingDeadline: row.bookingDeadline?.toISOString() ?? null,
    registrationDeadline: row.registrationDeadline?.toISOString() ?? null,
    organizer: {
      id: organizer?.id ?? row.organizerId,
      name: organizer?.name ?? "",
      websiteUrl: organizer?.websiteUrl ?? null,
    },
    venue: {
      id: venue?.id ?? row.venueId,
      name: venue?.name ?? "",
      address: venue?.address ?? null,
      lat: venue?.lat ?? null,
      lng: venue?.lng ?? null,
    },
    occurrences: occurrences
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((item) => ({
        id: item.id,
        startAt: item.startAt.toISOString(),
        endAt: item.endAt?.toISOString() ?? null,
      })),
    sources: sources.map((item) => ({
      id: item.id,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      importedAt: item.importedAt.toISOString(),
    })),
  };
}

function publicCard(card: AdminCard & { saved?: boolean; interested?: boolean }) {
  const { sources: _sources, ...rest } = card;
  return {
    ...rest,
    coverUrl: card.mediaStatus === "READY" ? card.coverUrl : null,
    imageUrls: card.mediaStatus === "READY" ? card.imageUrls : [],
    saved: card.saved ?? false,
    interested: card.interested ?? false,
  };
}

function publicDetail(card: AdminCard & { saved?: boolean; interested?: boolean }) {
  return {
    ...publicCard(card),
    bodyBlocks: renderExperienceBody(card.body),
  };
}

function nextStart(occurrences: { startAt: string }[], now: Date): number {
  const future = occurrences
    .map((item) => Date.parse(item.startAt))
    .filter((time) => time >= now.getTime())
    .sort((a, b) => a - b);
  return future[0] ?? occurrences.map((item) => Date.parse(item.startAt)).sort((a, b) => a - b)[0] ?? 0;
}

function remindAtFor(starts: Date[], now: Date): Date | null {
  const future = starts
    .filter((start) => start.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const next = future[0];
  if (!next) return null;
  return new Date(Math.max(next.getTime() - 3 * 60 * 60 * 1000, now.getTime()));
}
