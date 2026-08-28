(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const elements = {
    favoritePlaces: document.querySelector("#favorite-places"),
    favoriteFoods: document.querySelector("#favorite-foods"),
    travelDays: document.querySelector("#travel-days"),
    ownerEditToggle: document.querySelector("#owner-edit-toggle"),
    ownerLoginForm: document.querySelector("#owner-login-form"),
    ownerEmail: document.querySelector("#owner-email"),
    ownerForm: document.querySelector("#city-details-form"),
    favoritePlacesInput: document.querySelector("#favorite-places-input"),
    favoriteFoodsInput: document.querySelector("#favorite-foods-input"),
    travelDaysMin: document.querySelector("#travel-days-min"),
    travelDaysMax: document.querySelector("#travel-days-max"),
    ownerSignOut: document.querySelector("#owner-sign-out"),
    ownerStatus: document.querySelector("#owner-status"),
    ratingAverage: document.querySelector("#rating-average"),
    ratingCount: document.querySelector("#rating-count"),
    ratingForm: document.querySelector("#rating-form"),
    ratingScore: document.querySelector("#rating-score"),
    ratingValue: document.querySelector("#rating-value"),
    ratingStatus: document.querySelector("#rating-status")
  };

  let client = null;
  let currentCity = null;
  let currentDetails = null;
  let currentUser = null;
  let isOwner = false;
  let requestSequence = 0;
  let ratingSummaries = new Map();
  let ratingSummariesLoaded = false;
  let ratingSummariesError = false;

  function isConfigured() {
    return Boolean(
      config.url
      && config.publishableKey
      && !config.url.includes("YOUR_PROJECT_ID")
      && !config.publishableKey.includes("YOUR_SUPABASE")
    );
  }

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function formatError(error, fallback) {
    if (!error) return fallback;
    if (/row-level security|permission denied/i.test(error.message || "")) {
      return "当前账号没有执行此操作的权限。";
    }
    return fallback;
  }

  function setFormEnabled(form, enabled) {
    form.querySelectorAll("input, textarea, button").forEach((control) => {
      control.disabled = !enabled;
    });
  }

  function getRatingState() {
    return {
      loaded: ratingSummariesLoaded,
      error: ratingSummariesError,
      ratings: [...ratingSummaries.values()].map((rating) => ({ ...rating }))
    };
  }

  function announceRatingSummaries() {
    window.dispatchEvent(new CustomEvent("travel:ratings-updated", {
      detail: getRatingState()
    }));
  }

  async function refreshRatingSummaries() {
    if (!client) return;
    const { data, error } = await client
      .from("city_rating_summary")
      .select("city_name, average_score, rating_count");

    ratingSummariesLoaded = true;
    ratingSummariesError = Boolean(error);
    if (!error) {
      ratingSummaries = new Map((data || []).map((rating) => [rating.city_name, {
        cityName: rating.city_name,
        averageScore: Number(rating.average_score),
        ratingCount: Number(rating.rating_count)
      }]));
    }
    announceRatingSummaries();
  }

  function renderDetails(details) {
    currentDetails = details || null;
    elements.favoritePlaces.textContent = details?.favorite_places || "待填写";
    elements.favoriteFoods.textContent = details?.favorite_foods || "待填写";
    if (details?.travel_days_min) {
      const sameDay = details.travel_days_min === details.travel_days_max || !details.travel_days_max;
      elements.travelDays.textContent = sameDay
        ? `${details.travel_days_min} 天`
        : `${details.travel_days_min}–${details.travel_days_max} 天`;
    } else {
      elements.travelDays.textContent = "待填写";
    }

    elements.favoritePlacesInput.value = details?.favorite_places || "";
    elements.favoriteFoodsInput.value = details?.favorite_foods || "";
    elements.travelDaysMin.value = details?.travel_days_min || "";
    elements.travelDaysMax.value = details?.travel_days_max || "";
  }

  function resetCityView() {
    renderDetails(null);
    elements.ratingAverage.textContent = "—";
    elements.ratingCount.textContent = "正在载入评分…";
    elements.ratingScore.value = "8";
    elements.ratingValue.textContent = "8.0";
    setStatus(elements.ownerStatus, "");
    setStatus(elements.ratingStatus, "");
  }

  async function ensureSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) {
      currentUser = data.session.user;
      return;
    }

    const anonymous = await client.auth.signInAnonymously();
    if (anonymous.error) throw anonymous.error;
    currentUser = anonymous.data.user;
  }

  async function refreshOwnerState() {
    isOwner = false;
    elements.ownerForm.hidden = true;
    if (!currentUser || currentUser.is_anonymous) {
      elements.ownerEditToggle.textContent = "站主编辑";
      return;
    }

    const { data, error } = await client.rpc("is_current_user_owner");
    isOwner = !error && data === true;
    elements.ownerEditToggle.textContent = isOwner ? "编辑资料" : "站主编辑";
    if (isOwner) {
      elements.ownerLoginForm.hidden = true;
      setStatus(elements.ownerStatus, "站主已登录");
    }
    if (!isOwner) setStatus(elements.ownerStatus, "当前登录账号不是站主账号。", true);
  }

  async function loadCityData(cityName) {
    if (!client || !cityName) return;
    const sequence = ++requestSequence;
    setFormEnabled(elements.ratingForm, false);

    const detailRequest = client
      .from("city_details")
      .select("favorite_places, favorite_foods, travel_days_min, travel_days_max")
      .eq("city_name", cityName)
      .maybeSingle();
    const summaryRequest = client
      .from("city_rating_summary")
      .select("average_score, rating_count")
      .eq("city_name", cityName)
      .maybeSingle();
    const ownRatingRequest = currentUser
      ? client
          .from("city_ratings")
          .select("score")
          .eq("city_name", cityName)
          .eq("user_id", currentUser.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [detailsResult, summaryResult, ownRatingResult] = await Promise.all([
      detailRequest,
      summaryRequest,
      ownRatingRequest
    ]);
    if (sequence !== requestSequence || cityName !== currentCity) return;

    if (!detailsResult.error) renderDetails(detailsResult.data);
    else setStatus(elements.ownerStatus, "城市资料暂时无法载入。", true);

    if (!summaryResult.error && summaryResult.data?.rating_count) {
      elements.ratingAverage.textContent = Number(summaryResult.data.average_score).toFixed(1);
      elements.ratingCount.textContent = `${summaryResult.data.rating_count} 人评分`;
    } else if (!summaryResult.error) {
      elements.ratingAverage.textContent = "—";
      elements.ratingCount.textContent = "暂无评分";
    } else {
      elements.ratingCount.textContent = "评分暂时无法载入";
    }

    if (!ownRatingResult.error && ownRatingResult.data?.score) {
      elements.ratingScore.value = String(ownRatingResult.data.score);
      elements.ratingValue.textContent = Number(ownRatingResult.data.score).toFixed(1);
      setStatus(elements.ratingStatus, "你已经评过分，可以修改后重新提交。");
    }
    setFormEnabled(elements.ratingForm, Boolean(currentUser));
  }

  async function showCity(cityName) {
    currentCity = cityName;
    resetCityView();
    await ready;
    if (client && currentCity === cityName) await loadCityData(cityName);
  }

  async function submitRating(event) {
    event.preventDefault();
    if (!client || !currentUser || !currentCity) return;
    const score = Number(elements.ratingScore.value);
    if (score < 1 || score > 10) {
      setStatus(elements.ratingStatus, "评分需要在 1–10 分之间。", true);
      return;
    }

    setFormEnabled(elements.ratingForm, false);
    setStatus(elements.ratingStatus, "正在保存评分…");
    const { error } = await client.from("city_ratings").upsert({
      city_name: currentCity,
      user_id: currentUser.id,
      score,
      updated_at: new Date().toISOString()
    }, { onConflict: "city_name,user_id" });

    if (error) {
      setStatus(elements.ratingStatus, formatError(error, "评分保存失败，请稍后重试。"), true);
      setFormEnabled(elements.ratingForm, true);
      return;
    }
    setStatus(elements.ratingStatus, "评分已保存");
    await loadCityData(currentCity);
    await refreshRatingSummaries();
  }

  async function sendOwnerLogin(event) {
    event.preventDefault();
    if (!client) return;
    const email = elements.ownerEmail.value.trim();
    if (!email) return;
    setFormEnabled(elements.ownerLoginForm, false);
    setStatus(elements.ownerStatus, "正在发送登录链接…");
    const redirectUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    await client.auth.signOut({ scope: "local" });
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl }
    });
    setFormEnabled(elements.ownerLoginForm, true);
    if (error) {
      const anonymous = await client.auth.signInAnonymously();
      currentUser = anonymous.data?.user || null;
      setStatus(elements.ownerStatus, "登录链接发送失败，请检查邮箱或稍后重试。", true);
      return;
    }
    setStatus(elements.ownerStatus, "登录链接已发送，请前往邮箱确认。若不是站主账号，登录后仍无法编辑。" );
  }

  async function saveCityDetails(event) {
    event.preventDefault();
    if (!client || !currentUser || !currentCity || !isOwner) return;
    let daysMin = Number(elements.travelDaysMin.value) || null;
    let daysMax = Number(elements.travelDaysMax.value) || null;
    if (!daysMin && daysMax) daysMin = daysMax;
    if (daysMin && !daysMax) daysMax = daysMin;
    if (daysMin && daysMax && daysMax < daysMin) {
      setStatus(elements.ownerStatus, "最多天数不能小于最少天数。", true);
      return;
    }

    setFormEnabled(elements.ownerForm, false);
    setStatus(elements.ownerStatus, "正在保存城市资料…");
    const payload = {
      city_name: currentCity,
      favorite_places: elements.favoritePlacesInput.value.trim() || null,
      favorite_foods: elements.favoriteFoodsInput.value.trim() || null,
      travel_days_min: daysMin,
      travel_days_max: daysMax,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client
      .from("city_details")
      .upsert(payload, { onConflict: "city_name" })
      .select("favorite_places, favorite_foods, travel_days_min, travel_days_max")
      .single();
    setFormEnabled(elements.ownerForm, true);
    if (error) {
      setStatus(elements.ownerStatus, formatError(error, "城市资料保存失败，请稍后重试。"), true);
      return;
    }
    renderDetails(data);
    elements.ownerForm.hidden = true;
    setStatus(elements.ownerStatus, "城市资料已保存");
  }

  async function signOutOwner() {
    if (!client) return;
    await client.auth.signOut({ scope: "local" });
    const anonymous = await client.auth.signInAnonymously();
    currentUser = anonymous.data?.user || null;
    await refreshOwnerState();
    elements.ownerLoginForm.hidden = true;
    setStatus(elements.ownerStatus, "已退出站主登录");
    if (currentCity) await loadCityData(currentCity);
  }

  function bindEvents() {
    elements.ratingScore.addEventListener("input", () => {
      elements.ratingValue.textContent = Number(elements.ratingScore.value).toFixed(1);
    });
    elements.ratingForm.addEventListener("submit", submitRating);
    elements.ownerLoginForm.addEventListener("submit", sendOwnerLogin);
    elements.ownerForm.addEventListener("submit", saveCityDetails);
    elements.ownerSignOut.addEventListener("click", signOutOwner);
    elements.ownerEditToggle.addEventListener("click", () => {
      if (!client) {
        setStatus(elements.ownerStatus, "请先完成 Supabase 配置。", true);
        return;
      }
      if (isOwner) {
        elements.ownerForm.hidden = !elements.ownerForm.hidden;
        elements.ownerLoginForm.hidden = true;
      } else {
        elements.ownerLoginForm.hidden = !elements.ownerLoginForm.hidden;
        elements.ownerForm.hidden = true;
      }
    });
  }

  async function initialize() {
    bindEvents();
    if (!isConfigured() || !window.supabase?.createClient) {
      setFormEnabled(elements.ratingForm, false);
      setStatus(elements.ratingStatus, "评分功能等待 Supabase 配置后开放。", true);
      setStatus(elements.ownerStatus, "城市资料功能等待 Supabase 配置后开放。", true);
      return;
    }

    client = window.supabase.createClient(config.url, config.publishableKey);
    const ratingSummariesRequest = refreshRatingSummaries();
    try {
      await ensureSession();
      await refreshOwnerState();
    } catch (error) {
      client = null;
      setFormEnabled(elements.ratingForm, false);
      setStatus(elements.ratingStatus, "评分服务连接失败，请稍后重试。", true);
      return;
    }
    await ratingSummariesRequest;

    client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(async () => {
        currentUser = session?.user || null;
        await refreshOwnerState();
        if (currentCity) await loadCityData(currentCity);
      }, 0);
    });
  }

  const ready = initialize();
  window.TRAVEL_COMMUNITY = { showCity, getRatingState, refreshRatingSummaries };
})();
