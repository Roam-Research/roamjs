function jsonEncode(baseUrl, json) {
  const url = new URL(baseUrl);
  Object.entries(json).map(([k, v]) => url.searchParams.set(k, v))
  return url.href;
}

async function callSlackAPI(url, data) {
  // Can only submit GET requests to the Slack API via web since they have CORS
  // setup to deny Authentication and Content-Type headers.
  const response = await fetch(jsonEncode(url, { token: window.oauthToken, ...data }));
  return response.json();
}

async function getUserId(email) {
  // Needs users:read.email permissions.
  const lookupByEmailURL = "https://slack.com/api/users.lookupByEmail";
  const response = await callSlackAPI(lookupByEmailURL, { email });
  return response.ok ? response.user.id : false;
}

async function postNotification(msg, email) {
  // Needs chat:write permissions.
  const postMessageURL = "https://slack.com/api/chat.postMessage";
  const response = await callSlackAPI(postMessageURL, {
    channel: window.notificationChannel,
    unfurl_links: false,
    link_names: true,
    text: msg,
    username: window.emailToName[email],
    icon_url: "https://i.imgur.com/43iOH0I.png"
  });
  return response.ok;
}

function blockLink(blockId) {
  const graph = document.location.href.match(/^.*?\/app\/([^\/]+)\/?/)[1];
  return `https://roamresearch.com/#/app/${graph}/page/${blockId}`;
}

async function handleTag(tag, msg) {
  const email = window.tagToEmail[tag];
  if (email) {
    const uid = await getUserId(email);
    if (!uid) {
      return false;
    };
    return msg.replace(tag, `<@${uid}>`)
  }
}


async function styleMsg(msg) {
  const regexp = /\([()]*(\([^()]*\)[^()]*)*\)/g;
  let blockRefs = msg.match(regexp)
  if (blockRefs) {
    let refsToLinks = blockRefs.reduce((o,b) => {
                                         o[b] = blockLink(b.substring(2, b.length - 2))
                                         return o
                                       },{});
    for (ref in refsToLinks) {
      const arr = await window.roamAlphaAPI.q(`
                                    [:find ?s
									 :in $ ?u
									 :where
									 [?b :block/uid ?u]
								     [?b :block/string ?s]]`,
                                   ref.substring(2, ref.length - 2))
      msg = msg.replace(ref, `<${refsToLinks[ref]}|${arr[0]}>`);
    };
  }
  return msg.replace("{{[[POMO]]}}", "🍅").replace("{{[[TODO]]}}", "🔲").replace("{{[[DONE]]}}", "✅");
}


function newTags(before, after) {
  const tagRegExp = /#(?:\[\[)?([^\s])*(?:\]\])?/g;
  const tagsBefore = before.match(tagRegExp) || [];
  const tagsAfter = after.match(tagRegExp) || [];
  return tagsAfter.filter(t => !tagsBefore.includes(t));
}

window.watchBlocksForNewTags = () => {
  let lastBlockId = null;
  let lastBlockStr = null;
  const callback = async function (mutationsList, _) {
    // Events aren't necessarily ordered.
    // First check all the blocks left from and handle new tags.
    for (var mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.removedNodes.length && mutation.removedNodes[0].childElementCount && mutation.removedNodes[0].children[0].classList.contains('rm-block-input')) {
        const blockId = mutation.target.children[1].id.match(/.{9}$/)[0];
        let str = mutation.removedNodes[0].children[0].textContent;
        // console.log("exit block", blockId, str)
        if (lastBlockId == blockId) {
          const tags = newTags(lastBlockStr, str);
          console.log(tags)
          if (tags.length > 0) {
            for (tag of tags) {
             str = await handleTag(tag, str)
            }
            str = await styleMsg(str)
            str = str + " " + `<${blockLink(blockId)}|🔗>`
            let email = await window.roamAlphaAPI.q(`
                                    [:find ?em
									 :in $ ?u
									 :where
									 [?e :block/uid ?u]
								     [?e :edit/email ?em]]`,
                                   blockId)
            return await postNotification(str, email);   
          }
        }
      }
    }
    // Then check what the new block is, if any.
    for (var mutation of mutationsList) {
      // Enter existing block.
      if (mutation.type === 'childList' && mutation.addedNodes.length && mutation.addedNodes[0].childElementCount && mutation.addedNodes[0].children[0].classList.contains('rm-block-input')) {
        const blockId = mutation.target.children[1].children[0].id.match(/.{9}$/)[0];
        const str = mutation.addedNodes[0].children[0].textContent;
        lastBlockId = blockId;
        lastBlockStr = str;
      }

      // Enter new block.
      if (mutation.type === 'childList' && mutation.addedNodes.length && mutation.addedNodes[0].childElementCount &&
        mutation.addedNodes[0].children[0] &&
        mutation.addedNodes[0].children[0].children[0] &&
        mutation.addedNodes[0].children[0].children[0].children[1] &&
        mutation.addedNodes[0].children[0].children[0].children[1].children[0] &&
        mutation.addedNodes[0].children[0].children[0].children[1].children[0].classList.contains('rm-block-input')
      ) {
        const el = mutation.addedNodes[0].children[0].children[0].children[1].children[0];
        const blockId = el.id.match(/.{9}$/)[0];
        const str = el.textContent;
        lastBlockId = blockId;
        lastBlockStr = str;
        // console.log("enter new block", blockId, str)
      }
    }
  };
  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { childList: true, subtree: true });
}