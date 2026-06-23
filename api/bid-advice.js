function safeNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseModelJson(payload){
  if(payload?.output_text){
    return JSON.parse(payload.output_text);
  }

  const output = payload?.output || [];
  for(const item of output){
    const content = item?.content || [];
    for(const part of content){
      if(part?.type === "output_text" && part.text){
        return JSON.parse(part.text);
      }
      if(part?.type === "text" && part.text){
        return JSON.parse(part.text);
      }
    }
  }

  const firstMessage = output.find(item => item?.type === "message");
  throw new Error(`AI response did not contain JSON. Output types: ${output.map(item => item?.type || "unknown").join(", ")}${firstMessage?.status ? `. Message status: ${firstMessage.status}` : ""}`);
}

function extractEuroPrices(advice){
  const sources = Array.isArray(advice?.sources) ? advice.sources : [];
  const prices = [];
  for(const source of sources){
    const text = `${source?.title || ""} ${source?.url || ""}`;
    const matches = text.match(/(?:€\s*)?(\d{2,3}(?:[.,\s]\d{3})|\d{5,6})\s*(?:€|eur|euro)?/gi) || [];
    for(const match of matches){
      const number = Number(match.replace(/[^\d]/g, ""));
      if(number >= 10000 && number <= 200000) prices.push(number);
    }
  }
  return prices;
}

function normalizeVerdict(value, confidence){
  const text = String(value || "").trim();
  const lowered = text.toLowerCase();
  if(["low","medium","high"].includes(lowered)){
    if(lowered === "high" && confidence !== "low") return "Лот выглядит интересным";
    if(lowered === "medium") return "Можно рассматривать осторожно";
    return "Нужны дополнительные данные";
  }
  return text || "AI оценка";
}

function normalizeAdvice(advice, input){
  const normalized = {...advice};
  const market = input?.market || {};
  const calc = input?.calculation || {};
  const targetSavings = safeNumber(market.targetSavings) || 3000;
  const totalUsd = safeNumber(calc.totalUsd);
  const currentBid = safeNumber(input?.lot?.currentBid || calc.lotPrice);

  normalized.verdict = normalizeVerdict(normalized.verdict, normalized.confidence);

  const euroPrices = extractEuroPrices(normalized);
  if((!safeNumber(normalized.marketMin) || !safeNumber(normalized.marketMax)) && euroPrices.length){
    const usdPrices = euroPrices.map(price => Math.round(price * 1.09 / 100) * 100).sort((a,b) => a - b);
    normalized.marketMin = usdPrices[0];
    normalized.marketMax = usdPrices[usdPrices.length - 1];
    if(!normalized.summary || normalized.summary.length > 360){
      normalized.summary = "AI нашел похожие предложения на рынке Молдовы и построил предварительный диапазон по ним.";
    }
  }

  if(!safeNumber(normalized.repairMin) || !safeNumber(normalized.repairMax)){
    const damage = String(input?.lot?.damage || "").toLowerCase();
    const fuel = String(input?.lot?.fuel || input?.form?.fuel || "").toLowerCase();
    if(/water|flood|mechanical/i.test(damage)){
      normalized.repairMin = fuel === "electric" ? 7000 : 5000;
      normalized.repairMax = fuel === "electric" ? 13000 : 9000;
    }else if(/front/i.test(damage)){
      normalized.repairMin = fuel === "electric" ? 4500 : 3000;
      normalized.repairMax = fuel === "electric" ? 8500 : 6000;
    }else if(/rear|side|left|right/i.test(damage)){
      normalized.repairMin = 2500;
      normalized.repairMax = 5500;
    }
  }

  const soldComps = Array.isArray(normalized.soldComps) ? normalized.soldComps : [];
  const solidComps = soldComps.filter(comp => safeNumber(comp?.salePrice) > 0);
  if(solidComps.length < 2 && (!safeNumber(normalized.bidMin) || !safeNumber(normalized.bidMax))){
    normalized.confidence = "low";
    normalized.verdict = "Нужна история похожих продаж";
    normalized.summary = normalized.summary || "Для честного диапазона ставки нужно найти несколько похожих проданных лотов по году, пробегу и повреждениям.";
  }

  if(safeNumber(normalized.marketMin) && safeNumber(normalized.marketMax) && totalUsd){
    const repairMin = safeNumber(normalized.repairMin);
    const repairMax = safeNumber(normalized.repairMax);
    normalized.savingsMin = safeNumber(normalized.marketMin) - totalUsd - repairMax;
    normalized.savingsMax = safeNumber(normalized.marketMax) - totalUsd - repairMin;
    if(!safeNumber(normalized.bidMin) || !safeNumber(normalized.bidMax) || safeNumber(normalized.bidMax) <= currentBid){
      const headroomMin = Math.max(0, normalized.savingsMin - targetSavings);
      const headroomMax = Math.max(0, normalized.savingsMax - targetSavings);
      normalized.bidMin = Math.round(Math.max(currentBid, currentBid + headroomMin * 0.45) / 100) * 100;
      normalized.bidMax = Math.round(Math.max(normalized.bidMin, currentBid + headroomMax * 0.55) / 100) * 100;
    }
    if(normalized.savingsMax >= targetSavings && solidComps.length >= 2){
      normalized.verdict = normalized.savingsMin >= targetSavings ? "Лот имеет смысл торговать" : "Можно рассматривать осторожно";
      normalized.confidence = normalized.confidence === "low" ? "medium" : normalized.confidence;
    }
  }

  normalized.reasons = Array.isArray(normalized.reasons) ? normalized.reasons.slice(0, 4) : [];
  normalized.warnings = Array.isArray(normalized.warnings) ? normalized.warnings.slice(0, 2) : [];
  normalized.sources = Array.isArray(normalized.sources) ? normalized.sources.slice(0, 5) : [];
  normalized.soldComps = solidComps.slice(0, 5);
  return normalized;
}

function fallbackAdvice(input){
  const calc = input?.calculation || {};
  const market = input?.market || {};
  const total = safeNumber(calc.totalUsd);
  const marketMin = safeNumber(market.marketMin);
  const marketMax = safeNumber(market.marketMax);
  const repairMin = safeNumber(market.repairMin);
  const repairMax = safeNumber(market.repairMax);
  const targetSavings = safeNumber(market.targetSavings) || 3000;

  if(!marketMin || !marketMax || !repairMin || !repairMax){
  return {
    verdict:"Нужны данные рынка",
    bidMin:0,
    bidMax:0,
    marketMin:0,
    marketMax:0,
    repairMin:0,
    repairMax:0,
    savingsMin:0,
    savingsMax:0,
    confidence:"low",
    summary:"Для AI-рекомендации укажите рынок Молдовы и примерный ремонт. Позже эти данные можно будет подтягивать автоматически.",
    reasons:["Нет диапазона рынка Молдовы", "Нет диапазона ремонта"],
    warnings:["Не стоит задавать лимит ставки без рынка и ремонта"],
    sources:[],
    soldComps:[]
  };
  }

  const afterRepairLow = total + repairMin;
  const afterRepairHigh = total + repairMax;
  return {
    verdict:"Предварительная оценка без AI",
    bidMin:0,
    bidMax:0,
    marketMin,
    marketMax,
    repairMin,
    repairMax,
    savingsMin:marketMin - afterRepairHigh,
    savingsMax:marketMax - afterRepairLow,
    confidence:"low",
    summary:`AI-ключ не подключен. По введенным данным после ремонта получается примерно $${Math.round(afterRepairLow).toLocaleString("en-US")}–$${Math.round(afterRepairHigh).toLocaleString("en-US")}.`,
    reasons:[`Желаемая экономия: $${Math.round(targetSavings).toLocaleString("en-US")}`, "Подключите OPENAI_API_KEY, чтобы ChatGPT дал диапазон ставки и объяснение"],
    warnings:["Это математическая заготовка, не финальная торговая рекомендация"],
    sources:[],
    soldComps:[]
  };
}

module.exports = async function handler(request, response){
  const key = process.env.OPENAI_API_KEY;
  let input = {};

  try{
    input = typeof request.body === "object" && request.body
      ? request.body
      : JSON.parse(request.body || "{}");
  }catch(error){
    response.status(400).json({ok:false,error:"Bad request body"});
    return;
  }

  if(!key){
    response.status(200).json({ok:true,mode:"fallback",advice:fallbackAdvice(input)});
    return;
  }

  const schema = {
    type:"object",
    additionalProperties:false,
    required:["verdict","bidMin","bidMax","marketMin","marketMax","repairMin","repairMax","savingsMin","savingsMax","confidence","summary","reasons","warnings","sources","soldComps"],
    properties:{
      verdict:{type:"string"},
      bidMin:{type:"number"},
      bidMax:{type:"number"},
      marketMin:{type:"number"},
      marketMax:{type:"number"},
      repairMin:{type:"number"},
      repairMax:{type:"number"},
      savingsMin:{type:"number"},
      savingsMax:{type:"number"},
      confidence:{type:"string",enum:["low","medium","high"]},
      summary:{type:"string"},
      reasons:{type:"array",items:{type:"string"}},
      warnings:{type:"array",items:{type:"string"}},
      sources:{
        type:"array",
        items:{
          type:"object",
          additionalProperties:false,
          required:["title","url"],
          properties:{
            title:{type:"string"},
            url:{type:"string"}
          }
        }
      },
      soldComps:{
        type:"array",
        items:{
          type:"object",
          additionalProperties:false,
          required:["title","url","salePrice","year","mileage","damage","acv"],
          properties:{
            title:{type:"string"},
            url:{type:"string"},
            salePrice:{type:"number"},
            year:{type:"number"},
            mileage:{type:"number"},
            damage:{type:"string"},
            acv:{type:"number"}
          }
        }
      }
    }
  };

  const prompt = [
    "Ты автоэксперт APEX AUTO по покупке авто с IAAI/Copart для рынка Молдовы.",
    "Нужно дать реалистичный диапазон ставки, а не красивую фантазию. Главная опора для ставки - архив проданных лотов, а не только живые объявления.",
    "Сначала ищи историю продаж похожих IAAI/Copart лотов: same make/model/trim, year +/- 1, похожий пробег, похожее повреждение, близкий ACV, такое же топливо.",
    "Подходящие источники для web search: BidHistory, BidFax, BidCars archive, Stat.vin/StatVin, Clean VIN, BidStreamline, AutoAstat/AutoBidMaster history, другие страницы с final bid/sold price.",
    "В soldComps добавляй только реальные проданные лоты с финальной ценой продажи. Живые объявления Молдовы туда не добавлять.",
    "Для ставки используй median/диапазон final sale price похожих проданных лотов. Текущая ставка может быть только нижней точкой, а не рекомендацией сама по себе.",
    "Если найдено меньше 2 похожих проданных лотов с ценой продажи, не давай точную ставку: bidMin=0, bidMax=0, confidence=low, verdict='Нужна история похожих продаж'.",
    "Рынок Молдовы используй вторым слоем: чтобы понять экономику после доставки, таможни и ремонта. В первую очередь 999.md, Auto.Ria Украина не использовать.",
    "Если exact match по рынку Молдовы не найден, используй близкие предложения same model/year или same model +/- 1 год и корректируй confidence.",
    "Цены в евро конвертируй примерно в USD по 1 EUR = 1.09 USD.",
    "verdict не может быть 'low', 'medium' или 'high'. confidence отдельно.",
    "summary максимум 2 коротких предложения.",
    "Не используй ACV как рыночную цену Молдовы. ACV можно использовать только как ориентир класса/масштаба лота.",
    "Не пиши, что цена лота соответствует рынку Молдовы: цена лота - это текущая/аукционная цена, а рынок Молдовы - отдельная готовая машина.",
    "Важные правила APEX:",
    "- Auto.Ria Украина не использовать как рынок Молдовы.",
    "- Если используешь web search, верни sources с найденными страницами/поисковыми результатами.",
    "- Батарею упоминать только для электромобиля без Run & Drive.",
    "- Двигатель/запуск упоминать только при Mechanical, Water/Flood или явно тяжелом Front End.",
    "- Подушки/пиропатрон и отсутствие ключа могут логично делать авто незаводным, это не равно поломке двигателя.",
    "- Документы упоминать как расход только для Bill of Sale, ACQ, Parts Only.",
    "Верни только JSON по схеме.",
    "",
    JSON.stringify(input)
  ].join("\n");

  try{
    const buildBody = (useWebSearch) => ({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input:[
        {
          role:"user",
          content:[{type:"input_text",text:prompt}]
        }
      ],
      tools:useWebSearch ? [
        {
          type:"web_search_preview",
          search_context_size:"medium",
          user_location:{
            type:"approximate",
            country:"MD",
            city:"Chisinau",
            timezone:"Europe/Chisinau"
          }
        }
      ] : [],
      tool_choice:"auto",
      text:{
        format:{
          type:"json_schema",
          name:"apex_bid_advice",
          strict:true,
          schema
        }
      }
    });

    const callOpenAi = async (body) => {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{
        "authorization":`Bearer ${key}`,
        "content-type":"application/json"
      },
      body:JSON.stringify(body)
      });
      const payload = await upstream.json().catch(() => null);
      if(!upstream.ok){
        const error = new Error(payload?.error?.message || "OpenAI request failed");
        error.status = upstream.status;
        throw error;
      }
      return payload;
    };

    const useWebSearch = process.env.OPENAI_WEB_SEARCH !== "0";
    let payload;
    let mode = useWebSearch ? "ai-web" : "ai";
    try{
      payload = await callOpenAi(buildBody(useWebSearch));
    }catch(error){
      if(!useWebSearch) throw error;
      payload = await callOpenAi(buildBody(false));
      mode = "ai";
    }

    response.status(200).json({ok:true,mode,advice:normalizeAdvice(parseModelJson(payload), input)});
  }catch(error){
    response.status(500).json({ok:false,error:"AI advice failed",details:error?.message || ""});
  }
};
