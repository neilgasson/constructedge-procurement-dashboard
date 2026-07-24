(function () {
  "use strict";

  const filterDefinitions = [
    ["Project_Name", "Project"],
    ["Supplier_Name", "Supplier"],
    ["Material_Category", "Material category"],
    ["Procurement_Method", "Procurement method"],
    ["Delivery_Status", "Delivery status"]
  ];

  const currency = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  });

  const compactCurrency = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    notation: "compact",
    maximumFractionDigits: 2
  });

  const percent = new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  }

  function groupBy(rows, key) {
    const groups = new Map();
    rows.forEach((row) => {
      const name = row[key];
      const group = groups.get(name) || [];
      group.push(row);
      groups.set(name, group);
    });
    return groups;
  }

  function renderProjectVarianceChart(rows) {
    const results = Array.from(groupBy(rows, "Project_Name"), ([name, group]) => ({
      name,
      value: sum(group, "Cost_Variance_CAD")
    }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    if (!results.length) {
      return '<p class="empty-state">No transactions match the current filters.</p>';
    }

    const maximum = Math.max(...results.map((item) => Math.abs(item.value)), 1);
    return `
      <div class="bar-chart" aria-label="Net cost variance by project">
        ${results.map((item) => `
          <div class="bar-row" title="${escapeHtml(item.name)}: ${escapeHtml(currency.format(item.value))}">
            <span>${escapeHtml(item.name)}</span>
            <div class="bar-track">
              <i class="${item.value > 0 ? "bar-positive" : "bar-negative"}"
                 style="width:${Math.max((Math.abs(item.value) / maximum) * 100, 2)}%"></i>
            </div>
            <strong>${escapeHtml(compactCurrency.format(item.value))}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderCategoryDeliveryChart(rows) {
    const delivered = rows.filter((row) => row.Delivery_Status === "Delivered");
    const results = Array.from(groupBy(delivered, "Material_Category"), ([name, group]) => ({
      name,
      count: group.length,
      rate: group.filter((row) => row.On_Time_Delivery === "Yes").length / group.length
    })).sort((a, b) => b.rate - a.rate);

    if (!results.length) {
      return '<p class="empty-state">No Delivered records match the current filters.</p>';
    }

    return `
      <div class="delivery-chart" aria-label="Delivered-only on-time rate by material category">
        ${results.map((item) => `
          <div class="delivery-row">
            <div>
              <span>${escapeHtml(item.name)}</span>
              <small>${item.count} delivered</small>
            </div>
            <div class="delivery-track" title="${escapeHtml(percent.format(item.rate))} on time">
              <i class="${item.rate >= 0.740196 ? "delivery-good" : "delivery-watch"}"
                 style="width:${item.rate * 100}%"></i>
            </div>
            <strong>${escapeHtml(percent.format(item.rate))}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderTable(headers, rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEvidence(data) {
    const qualifyingSuppliers = data.q2.suppliers.filter((item) => item.consistent_above_budget);
    return `
      <section class="evidence-section">
        <div class="section-heading">
          <p class="eyebrow">Required question proof</p>
          <h2>Methods, supporting tables, and final rankings</h2>
          <p>
            The tables below use the complete official dataset and reproduce
            the independently verified assignment answers.
          </p>
        </div>

        <details id="q1" open>
          <summary>
            <span>Q1</span>
            <strong>Which projects and material categories have the highest cost overruns?</strong>
          </summary>
          <div class="evidence-body">
            <p>
              <b>Method:</b> sum Cost Variance in CAD by group; divide each
              group's summed variance by its summed budget for the percentage.
              All 400 records are included. Positive means over budget; negative
              means under budget.
            </p>
            ${renderTable(
              ["Rank", "Project", "POs", "Variance", "Variance %", "Gross positive exposure"],
              data.q1.projects.slice(0, 10).map((item, index) => [
                index + 1,
                item.name,
                item.purchase_orders,
                currency.format(item.net_cost_variance_cad),
                percent.format(item.net_cost_variance_pct),
                currency.format(item.gross_positive_overrun_cad)
              ])
            )}
            <p class="interpretation">
              Quarry Park Mixed-Use Development ranks first at
              ${escapeHtml(currency.format(data.q1.projects[0].net_cost_variance_cad))}.
              All six material categories are under budget on a net basis;
              Finishing is closest to zero at
              ${escapeHtml(currency.format(data.q1.material_categories[0].net_cost_variance_cad))}.
            </p>
          </div>
        </details>

        <details id="q2">
          <summary>
            <span>Q2</span>
            <strong>Which suppliers consistently price above budget?</strong>
          </summary>
          <div class="evidence-body">
            <p>
              <b>Approved rule:</b> more than 50% of a supplier's orders
              have positive variance and the supplier's total variance is
              positive. Rank by average variance, then share above budget.
            </p>
            ${renderTable(
              ["Rank", "Supplier", "POs", "Average variance", "Orders above budget", "Total variance"],
              qualifyingSuppliers.map((item, index) => [
                index + 1,
                item.name,
                item.purchase_orders,
                currency.format(item.average_variance_cad),
                percent.format(item.orders_above_budget_pct),
                currency.format(item.net_cost_variance_cad)
              ])
            )}
            <p class="interpretation">
              Houle Electric, PCL Mechanical, and Levitt-Safety Calgary are
              the only qualifying suppliers; their combined net positive
              variance is $2,022,856.51.
            </p>
          </div>
        </details>

        <details id="q3">
          <summary>
            <span>Q3</span>
            <strong>Does procurement method affect cost variance?</strong>
          </summary>
          <div class="evidence-body">
            <p>
              <b>Method:</b> compare mean, median, sample standard deviation,
              and count for every observed method. All 400 records are included.
              Invitational has no observed records.
            </p>
            ${renderTable(
              ["Method", "POs", "Average", "Median", "Std. dev.", "Average row variance"],
              data.q3.methods.map((item) => [
                item.display_name,
                item.purchase_orders,
                currency.format(item.average_variance_cad),
                currency.format(item.median_variance_cad),
                currency.format(item.std_dev_variance_cad),
                `${item.average_variance_pct_points.toFixed(2)} pp`
              ])
            )}
            <p class="interpretation">
              The method effect is not material: ANOVA p = 0.894 and η² =
              0.0028, meaning procurement method explains about 0.28% of
              row-level percentage-variance differences.
            </p>
          </div>
        </details>

        <details id="q4">
          <summary>
            <span>Q4</span>
            <strong>How do suppliers and material categories perform on delivery?</strong>
          </summary>
          <div class="evidence-body">
            <p>
              <b>Method:</b> Delivered records only; rank by on-time rate
              descending, average lead time ascending, then name. The portfolio
              rate is 151 on-time deliveries out of 204.
            </p>
            ${renderTable(
              ["Rank", "Material category", "Delivered", "Average lead", "Median lead", "On-time rate"],
              data.q4.material_categories.map((item, index) => [
                index + 1,
                item.name,
                item.delivered_orders,
                `${item.average_lead_time_days.toFixed(1)} days`,
                `${item.median_lead_time_days.toFixed(1)} days`,
                percent.format(item.on_time_delivery_rate)
              ])
            )}
            <p class="interpretation">
              Safety &amp; Temp Works leads at 82.86%; Finishing ranks last at
              64.29%. Supplier results range from 100% for Houle Electric and
              Ainsworth to 42.86% for Tremco.
            </p>
          </div>
        </details>

        <details id="q5">
          <summary>
            <span>Q5</span>
            <strong>What are the top three recommendations?</strong>
          </summary>
          <div class="evidence-body">
            <div class="recommendation-grid">
              ${data.q5.recommendations.map((item) => `
                <article>
                  <div>
                    <span>Priority ${escapeHtml(item.priority)}</span>
                    <b>0${item.rank}</b>
                  </div>
                  <h3>${escapeHtml(item.recommendation)}</h3>
                  <p>${escapeHtml(item.supporting_evidence)}</p>
                  <strong>${escapeHtml(item.estimated_impact)}</strong>
                </article>
              `).join("")}
            </div>
            <p class="method-note">
              Impact estimates are directional scenarios, overlap, and are not additive.
            </p>
          </div>
        </details>
      </section>
    `;
  }

  function dashboardMarkup(data, embedded) {
    const filterMarkup = filterDefinitions.map(([key, label]) => {
      const options = Array.from(new Set(data.rows.map((row) => row[key]))).sort();
      return `
        <label>
          <span>${escapeHtml(label)}</span>
          <select aria-label="Filter by ${escapeHtml(label)}" data-filter="${escapeHtml(key)}">
            <option value="">All</option>
            ${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
      `;
    }).join("");

    return `
      <div class="filter-panel">
        <div class="filter-heading">
          <div>
            <strong>Portfolio filters</strong>
            <span data-result-count>400 of 400 transactions shown</span>
          </div>
          <div class="filter-actions">
            <a class="export-button" href="#" download="ConstructEdge_Procurement_Filtered.csv" data-export>
              Export filtered CSV
            </a>
            <button type="button" data-reset>Reset all</button>
          </div>
        </div>
        <div class="filter-grid">${filterMarkup}</div>
      </div>

      <div class="kpi-grid">
        <article>
          <span>Transactions</span>
          <strong data-kpi="transactions">400</strong>
          <small>Official analysis records</small>
        </article>
        <article>
          <span>Budget</span>
          <strong data-kpi="budget">$431.52M</strong>
          <small>Authoritative budget value</small>
        </article>
        <article>
          <span>PO value</span>
          <strong data-kpi="po-value">$418.10M</strong>
          <small>Validated purchase-order value</small>
        </article>
        <article data-variance-card>
          <span>Net cost variance</span>
          <strong data-kpi="variance">−$13.41M</strong>
          <small data-kpi="variance-share">−3.1% of filtered budget</small>
        </article>
        <article>
          <span>On-time delivery</span>
          <strong data-kpi="on-time">74.0%</strong>
          <small data-kpi="delivered-count">Delivered records only (204)</small>
        </article>
        <article>
          <span>Average lead time</span>
          <strong data-kpi="lead-time">44.6 days</strong>
          <small>Delivered records only</small>
        </article>
      </div>

      <div class="chart-grid">
        <article class="chart-card">
          <div class="card-heading">
            <div>
              <span>Cost control</span>
              <h3>Net variance by project</h3>
            </div>
            <div class="legend">
              <span><i class="legend-over"></i> Over</span>
              <span><i class="legend-under"></i> Under</span>
            </div>
          </div>
          <div data-project-chart></div>
        </article>
        <article class="chart-card">
          <div class="card-heading">
            <div>
              <span>Delivery performance</span>
              <h3>On-time rate by category</h3>
            </div>
            <span class="benchmark">Benchmark 74.02%</span>
          </div>
          <div data-delivery-chart></div>
        </article>
      </div>

      ${embedded ? "" : renderEvidence(data)}
    `;
  }

  function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  function createCsvUrl(rows, allRows) {
    const columns = Object.keys(allRows[0] || {});
    const lines = [
      columns.map(csvCell).join(","),
      ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
    ];
    return `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(lines.join("\r\n"))}`;
  }

  function initializeDashboard(root, data) {
    const embedded = root.dataset.embedded === "true";
    root.innerHTML = dashboardMarkup(data, embedded);

    const selects = Array.from(root.querySelectorAll("[data-filter]"));
    const resultCount = root.querySelector("[data-result-count]");
    const projectChart = root.querySelector("[data-project-chart]");
    const deliveryChart = root.querySelector("[data-delivery-chart]");

    function filteredRows() {
      return data.rows.filter((row) =>
        selects.every((select) => !select.value || row[select.dataset.filter] === select.value)
      );
    }

    function update() {
      const rows = filteredRows();
      const budget = sum(rows, "Budget_Value_CAD");
      const poValue = sum(rows, "PO_Value_CAD");
      const variance = sum(rows, "Cost_Variance_CAD");
      const delivered = rows.filter((row) => row.Delivery_Status === "Delivered");
      const onTimeCount = delivered.filter((row) => row.On_Time_Delivery === "Yes").length;
      const onTimeRate = delivered.length ? onTimeCount / delivered.length : null;
      const averageLead = delivered.length
        ? delivered.reduce((total, row) => total + Number(row.Lead_Time_Days || 0), 0) / delivered.length
        : null;

      resultCount.textContent = `${rows.length} of ${data.rows.length} transactions shown`;
      root.querySelector('[data-kpi="transactions"]').textContent = String(rows.length);
      root.querySelector('[data-kpi="budget"]').textContent = compactCurrency.format(budget);
      root.querySelector('[data-kpi="po-value"]').textContent = compactCurrency.format(poValue);
      root.querySelector('[data-kpi="variance"]').textContent = compactCurrency.format(variance);
      root.querySelector('[data-kpi="variance-share"]').textContent =
        `${budget ? percent.format(variance / budget) : "—"} of filtered budget`;
      root.querySelector('[data-kpi="on-time"]').textContent =
        onTimeRate === null ? "—" : percent.format(onTimeRate);
      root.querySelector('[data-kpi="delivered-count"]').textContent =
        `Delivered records only (${delivered.length})`;
      root.querySelector('[data-kpi="lead-time"]').textContent =
        averageLead === null ? "—" : `${averageLead.toFixed(1)} days`;

      const varianceCard = root.querySelector("[data-variance-card]");
      varianceCard.classList.toggle("kpi-alert", variance > 0);
      varianceCard.classList.toggle("kpi-good", variance <= 0);
      projectChart.innerHTML = renderProjectVarianceChart(rows);
      deliveryChart.innerHTML = renderCategoryDeliveryChart(rows);
    }

    selects.forEach((select) => select.addEventListener("change", update));
    root.querySelector("[data-reset]").addEventListener("click", () => {
      selects.forEach((select) => {
        select.value = "";
      });
      update();
    });
    const exportLink = root.querySelector("[data-export]");
    exportLink.addEventListener("click", () => {
      exportLink.href = createCsvUrl(filteredRows(), data.rows);
    });

    update();
  }

  async function start() {
    const roots = Array.from(document.querySelectorAll("[data-dashboard]"));
    if (!roots.length) return;

    try {
      const response = await fetch("assets/data/procurement-data.json");
      if (!response.ok) throw new Error("Unable to load the validated dataset.");
      const data = await response.json();
      roots.forEach((root) => initializeDashboard(root, data));
    } catch (error) {
      roots.forEach((root) => {
        root.innerHTML = `<div class="dashboard-error">${escapeHtml(error.message || "Unable to load the validated dataset.")}</div>`;
      });
    }
  }

  start();
}());
