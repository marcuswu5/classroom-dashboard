'use strict';

/** @param {object} form */
function extractGradableQuestions(form) {
  const items = form.items || [];
  const out = [];
  for (const item of items) {
    const qi = item.questionItem;
    const q = qi && qi.question;
    if (!q || !q.questionId || !q.grading) continue;
    const title =
      typeof item.title === 'string' && item.title.trim()
        ? item.title.trim()
        : q.questionId;
    out.push({ questionId: q.questionId, title });
  }
  return out;
}

/** @param {object} form @param {object[]} responses */
function summarizeFormResponses(form, responses) {
  const gradable = extractGradableQuestions(form);
  const perQuestion = {};
  for (const g of gradable) {
    perQuestion[g.questionId] = {
      questionId: g.questionId,
      title: g.title,
      answeredCount: 0,
      correctCount: 0,
    };
  }

  const respondents = [];
  const seenEmail = new Set();

  for (const r of responses) {
    const email = (r.respondentEmail || '').trim();
    const ts = r.lastSubmittedTime || r.createTime || '';
    if (email && !seenEmail.has(email.toLowerCase())) {
      seenEmail.add(email.toLowerCase());
      respondents.push({ email, lastSubmittedTime: ts });
    }

    const answers = r.answers || {};
    for (const g of gradable) {
      const row = perQuestion[g.questionId];
      const ans = answers[g.questionId];
      const grade = ans && ans.grade;
      if (!grade) continue;
      row.answeredCount += 1;
      if (grade.correct === true) row.correctCount += 1;
    }
  }

  const questions = gradable.map((g) => {
    const row = perQuestion[g.questionId];
    const pct =
      row.answeredCount > 0
        ? Math.round((100 * row.correctCount) / row.answeredCount)
        : null;
    return {
      questionId: row.questionId,
      title: row.title,
      answeredCount: row.answeredCount,
      correctCount: row.correctCount,
      percentCorrect: pct,
    };
  });

  let sumPct = 0;
  let nWithPct = 0;
  for (const q of questions) {
    if (q.percentCorrect != null) {
      sumPct += q.percentCorrect;
      nWithPct += 1;
    }
  }
  const overallPercentCorrect =
    nWithPct > 0 ? Math.round(sumPct / nWithPct) : null;

  const info = form.info || {};
  const title =
    (typeof info.title === 'string' && info.title) ||
    (typeof form.formId === 'string' && form.formId) ||
    'Form';

  const formId = form.formId || '';
  const responderUrl =
    typeof form.responderUri === 'string' && form.responderUri
      ? form.responderUri
      : formId
        ? `https://docs.google.com/forms/d/${encodeURIComponent(formId)}/viewform`
        : '';

  return {
    formId,
    title,
    responderUrl,
    attendance: {
      responseCount: responses.length,
      uniqueRespondents: respondents.length,
      respondents,
    },
    quiz: {
      questions,
      overallPercentCorrect,
    },
  };
}

module.exports = { summarizeFormResponses, extractGradableQuestions };
