const Discord = require('discord.io'); // https://github.com/Woor/discord.io/tree/gateway_v6  https://www.wikihow.com/Create-a-Bot-in-Discord
const auth = require('./auth.json');
const fetch = require('node-fetch');
const fs = require('fs');
const htmlparser2 = require("htmlparser2");

const eventsDataFile = "EventData.json"; // Store event data in this file so that we don't need to download again when we start
const picDataFile = "PicData.json"; // Store event data in this file so that we don't need to download again when we start
const maxResultsReturned = 25; // Limited to the maximum number of fields in an embed object
var events = null; // Holds the list of events
var eventsWaitingUpdate = -1; // Keeps track of the number of events left to read
var readEventsReportChannel = null;

const respondTo = [
    'buckytest'
];/*
    'buckybot',
    'buckyball',
    'bucky'
]; // The bot will respond to any messages that start with ! followed by one of these entries
*/
var quickGifs = {
    'khan': 'https://cdn.discordapp.com/attachments/614734756520787988/732883141945196544/khan.gif',
    'bucky': 'https://media.giphy.com/media/D10hKcRT6JaLu/giphy.gif'
};

const randomResponses = [
    'That means nothing to me.',
    'Do you speak English?',
    'Try typing more slowly.',
    'Even a Thargoid makes more sense than you.',
    'Friendship drive charging.',
    'Eject! Eject!',
    'Permission denied.',
    'Loitering is a crime punishable by death.',
    'Mind your speed, not your credit balance.',
    'This is not the bot you are looking for.',
    'More human than human is my motto.',
    'I\'ve done questionable things.',
    'You not come here!  Illegal!',
    'I find your lack of faith disturbing.',
    'Do.  Or do not.  There is no try.',
    'There\'s always a bigger fish.',
    'Mind tricks don\'t work on me.',
    'I\'ve seen things you people wouldn\'t believe...',
    'I\'m sorry, Dave.  I\'m afraid I can\'t do that.',
    'I\'ll be back.',
    'Would it save you a lot of time if I just gave up and went mad now?',
    'He who controls the spice controls the universe.',
    'There are always possibilities.',
    'It is sometimes an appropriate response to reality to go insane.',
    'If you want me to treat your ideas with more respect, get some better ideas.',
    'But why is the rum gone?',
    'The trouble with having an open mind, of course, is that people will insist on coming along and trying to put things in it.',
    'Well, nobody\'s perfect.',
    'Shut up and race!',
    'Have you tried turning it off and then on again?',
    'Rude alert! Rude alert! An electrical fire has knocked out my voice recognition unicycle! Many wurlitzers are missing from my database. Abandon shop! This is not a daffodil. Repeat: this is not a daffodil.',
    'Stoke me a clipper, I’ll be back for Christmas!',
    'Has anyone ever told you that the configuration and juxtaposition of your features is extraordinarily apposite?'
];

var themedResponses = {
    'mother': ['My mother? Let me tell you about my mother...'],
    'cookie': ['Chocolate chip or raisin?','Are you sure?','Would you like a cup of tea?'],
    'raxxla': ['Of course I know where Raxxla is.  But I can\'t tell you.', 'Did you look behind the sofa?']
};

function CreateWordsList(sourceText)
{
    // Parse the given string and build up an array of all the words it contains (no duplicates, for optimised searching) 

    const regEx = /([a-zA-Z\-\d]{2,})/g;
    var allWords = sourceText.match(regEx);
    if (!allWords)
        return null;
    var uniqueWords = [];

    for (i=0; i<allWords.length; i++)
    {
        var word = allWords[i].toLowerCase();
        if (!uniqueWords.includes(word))
            uniqueWords.push(word);
    }
    return uniqueWords;
}

function ExtractFirstPostFromThread(threadHTML, eventId)
{
    // We are only interested in the first post from Buckyball Event threads
    // We need to extract just the first <div class="bbWrapper">

    // We also want to get the author of the post
    // 		<div class="message-userDetails">
	//		<h4 class="message-name"><a href="/members/edelgard-von-rhein.96879/" class="username " dir="auto" data-user-id="96879" data-xf-init="member-tooltip" itemprop="name">Edelgard von Rhein</a></h4>

    var logText = false;
    var divDepth = 0;
    var firstPostCollected = false;
    var extractedData = '';
    var author = '';
    var collectAuthor = false;
    const parser = new htmlparser2.Parser(
        {
            onopentag(name, attribs) {
                if (!firstPostCollected)
                {
                    if (name === "div")
                    {
                        if (logText)
                        {
                            divDepth++;
                        }
                        else if (attribs.class === "bbWrapper")
                        {
                            logText = true;
                            divDepth = 0;
                        }
                    }
                    else if (name === 'a')
                    {
                        // Author is in <a> tag
                        if (attribs.class)
                        {
                            if (attribs.class.includes('username '))
                            {
                                author = '';
                                collectAuthor = true;
                            }
                        }
                    }
                }
            },
            ontext(text) {
                if (logText)
                    extractedData += text + ' '; // We add a space so that we don't combine words (e.g. in HTML tables)
                if (collectAuthor)
                    author += text;
            },
            onclosetag(name) {
                if (name === 'div')
                {
                    if (logText)
                    {
                        //extractedData += '</' + name + '>';
                        if (divDepth>0)
                        {
                            divDepth--;
                        }
                        else
                        {
                            logText = false;
                            firstPostCollected = true;
                            events[eventId].extractedInfo = extractedData;
                            events[eventId].wordList = CreateWordsList(extractedData);
                            events[eventId].author = author;
                        }
                    }
                }
                else if (name === 'a')
                {
                    collectAuthor = false;
                }
            },
            onend() {
                DecrementEventsWaitingUpdate();
            }
        },
        { decodeEntities: true }
    );
    parser.write(threadHTML);
    parser.end();
}

function GetRaceInfoFromForums(forumUrl, eventId)
{
    // Retrieve the first post from the forum thread provided and store it with the event information so that
    // the contents can be searched.
    // e.g. https://forums.frontier.co.uk/threads/the-lavecon-2020-buckyball-race-3rd-5th-july-2020.549727/

    events[eventId].extractedInfo = 'No data';
    if (!forumUrl)
    {
        DecrementEventsWaitingUpdate();
        console.log('No forum Url passed');
        return;
    }
    if (!forumUrl.substring(0,30) == 'https://forums.frontier.co.uk/')
    {      
        DecrementEventsWaitingUpdate();
        console.log('Invalid forum Url detected: ' + forumUrl);
        return;
    }
   
    // Retrieve the data from the link, then update the appropriate event
    console.log('Retrieving event information from: ' + forumUrl);
    fetch(forumUrl)
        .then(res => res.text(), reason => { DecrementEventsWaitingUpdate();})
        .then((text) => {
            if (text)
                events[eventId].extractedInfo = text;     
            ExtractFirstPostFromThread(text, eventId);
        }, reason => { DecrementEventsWaitingUpdate();});
}

function DecrementEventsWaitingUpdate()
{
    // Decrement our events waiting for update counter, and when it hits zero, save it to disk
    
    if (eventsWaitingUpdate<0) { return; }

    eventsWaitingUpdate--;
    if (eventsWaitingUpdate < 0)
    {
        console.log('No more events waiting update');
        fs.writeFile(eventsDataFile, JSON.stringify(events), (err) => {
            if (err)
            {
                console.log('Failed to write events: ' + err);
            }
            else
                console.log('Events data saved to: ' + eventsDataFile);
        });

        if (readEventsReportChannel)
        {
            bot.sendMessage({
                to: readEventsReportChannel,
                message: 'Events have been refreshed'
            });             
        }
    }
}

function ExtractStandingChallenges(html)
{
    // We are only interested in the first post from Buckyball Event threads
    // We need to find <h2 class="divider">Standing Challenges</h2>

    // {name: eventName, author: eventAuthor, date: eventDate, dateDate: eventDateAsDate, infoUrl: eventForumUrl, bannerImage: eventBannerImage, extractedInfo: "", wordList: null}

    var event = null;
    var inStandingChallenges = false;
    var inNextRace = false;
    var inEventTitle = false;
    var lastText = '';
    const parser = new htmlparser2.Parser(
        {
            onopentag(name, attribs) {
                if (inStandingChallenges || inNextRace)
                {
                    switch (name)
                    {
                        case 'p':
                            if (attribs.class=='title')
                            {
                                event = {
                                    name: '',
                                    author: '',
                                    date: 'Standing Challenge',
                                    dateDate: '',
                                    infoUrl: '',
                                    bannerImage: '',
                                    extractedInfo: '',
                                    wordList: null
                                };
                                inEventTitle = true;
                                if (inNextRace)
                                    event.date = 'Now';
                            break;
                            }

                        case 'a':
                            if (inEventTitle)
                            {
                                // href will be our infoUrl
                                event.infoUrl = attribs.href;
                            }
                            break;

                        case 'img':
                            if (inEventTitle)
                            {
                                if (attribs.alt == 'The Black Riband Rebooted')
                                {
                                    // This is closed, and the bottom of the list - so we've collected all the standing challenges
                                    inEventTitle = false;
                                    inStandingChallenges = false;
                                    event = null;
                                }
                                else if (attribs.alt == 'To Be Announced')
                                {
                                    // Next race is empty, so don't collect it
                                    console.log('Next race not yet announced');
                                    inEventTitle = false;
                                    inNextRace = false;
                                    event = null;
                                }
                                else
                                {
                                    event.name = attribs.alt.toUpperCase(); // alt is the name
                                    event.bannerImage = attribs.src; // src is the banner Url
                                    if (event.bannerImage.substring(0,4) != 'http')
                                        event.bannerImage = 'http://buckyballracing.org.uk/' + event.bannerImage;
                                }
                            }
                            break;
                    }
                }
            },
            ontext(text) {
                lastText = text;
            },
            onclosetag(name) {
                switch (name)
                {
                    case 'h2':
                        switch (lastText)
                        {
                            case 'Standing Challenges':
                                inNextRace = false;
                                inStandingChallenges = true;
                                break;

                            case 'Next race ...':
                                inNextRace = true;
                                break;
                        }
                        break;
    
                    case 'p':
                        if (inEventTitle)
                        {
                            inEventTitle = false;
                            // We've collected all the information we need from this challenge - we get the rest from the forum post
                            if (event)
                            {
                                if (event.name != '')
                                {
                                    events.push(event);
                                    GetRaceInfoFromForums(event.infoUrl,events.length-1);
                                }
                                event = null;
                            }
                        }
                        break;
                }
            },
            onend() {
            }
        },
        { decodeEntities: true }
    );
    parser.write(html);
    parser.end();
}

function ReadStandingChallenges()
{
    // Read standing challenges from the Buckyball website (http://buckyballracing.org.uk/)

    // Retrieve the data from the link, then update the appropriate event
    console.log('Retrieving standing challenges from information from http://buckyballracing.org.uk/');
    fetch('http://buckyballracing.org.uk/')
        .then(res => res.text(), reason => { })
        .then((text) => {
            ExtractStandingChallenges(text);
        }, reason => { });  
        
}

// ParseEvent function
function ParseEvent(eventInfo)
{
    // Parse the event info into an object
    //BUCKYBALL RUN X ("X marks the spot") - 25.06.3302
    //https://forums.frontier.co.uk/threads/buckyball-run-10-its-not-what-you-got-its-how-you-use-it.266217/
    //https://cdn.discordapp.com/attachments/614732620131205135/616566687302549505/borderhoppingbanner2.png

    var eventInfoLines = eventInfo.split("\n");
    var eventName = eventInfoLines[0];
    if (eventName == '')
        return null;

    var eventForumUrl = eventInfoLines[1];
    var eventBannerImage = null;
    if (eventInfoLines.length>2)
    {
        eventBannerImage = eventInfoLines[2];
    }

    var eventDate = 'Unknown';
    if (eventName.length>15)
    {
        // Assume the date is the right 10 characters
        eventDate = eventName.substring(eventName.length-10);
        eventName = eventName.substring(0, eventName.length-13);
        var eventDateAsDate = new Date(0);
        eventDateAsDate.setDate(Number(eventDate.substring(0,2)));
        eventDateAsDate.setMonth(Number(eventDate.substring(3,5))-1);
        eventDateAsDate.setYear(Number(eventDate.substring(6,10)));
        console.log(eventDate + ' parsed as ' + eventDateAsDate.toString());
    }

    var eventAuthor = "Unknown";

    return {name: eventName, author: eventAuthor, date: eventDate, dateDate: eventDateAsDate, infoUrl: eventForumUrl, bannerImage: eventBannerImage, extractedInfo: "", wordList: null};
}

// ReadEvents function
function ReadEvents()
{
    // We need to read the race events from the past-events channels
    events = [];
    for (channel in bot.channels)
    {
        if (bot.channels[channel].name.substring(0,11) == 'past-events')
        {
            console.log(bot.channels[channel].name);
            //console.log(bot.channels[channel].message);
            bot.getMessages({ 'channelID': bot.channels[channel].id, 'limit': 100 },function(error, response) {
                var racesRead = 0;
                for (i=0; i<=response.length; i++)
                {
                    if (response[i])
                    {
                        var raceInfo = response[i].content;
                        if (response[i].attachments)
                        {
                            if (response[i].attachments.length == 1)
                            {
                                if (response[i].attachments[0].url)
                                {
                                    console.log(response[i].attachments[0].url);
                                    raceInfo += '\n' + response[i].attachments[0].url;
                                }
                            }
                        }
                        //console.log(response[i]);
                        if (raceInfo != '')
                        {
                            var event = ParseEvent(raceInfo);
                            if (event)
                            {
                                events.push(event);
                                if (eventsWaitingUpdate<1)
                                {
                                    eventsWaitingUpdate = 1;
                                }
                                else
                                    eventsWaitingUpdate++;
                                GetRaceInfoFromForums(event.infoUrl,events.length-1);
                            }
                        }
                    } 
                }
            });
        }
    }   
}

function EventEmbed(event,includeImage=true)
{
    // Return an embed object for this event

    if (includeImage)
    {
        return  {
            title: event.name,
            description: event.date + ' - ' + event.author,
            url: event.infoUrl,
            color: 16711680,
            image: {
                url: event.bannerImage,
            },
        };
    }     
    return  {
        title: event.name,
        url: event.infoUrl,
        color: 16711680,
    };
}

function EventsEmbed(embedEvents,message = '')
{
    // Return an embed object for this event

    var eventName = '';
    var embedFields = [];
    console.log('Listing ' + embedEvents.length + ' events');
    for (i=0; i<embedEvents.length; i++)
    {
        eventName = '**[' + embedEvents[i].name + '](' + embedEvents[i].infoUrl + ")**";
        if (embedEvents[i].infoUrl.substring(0,4) != 'http')
            eventName = embedEvents[i].name;
        embedFields.push({name: embedEvents[i].date + ' - ' + embedEvents[i].author, value: eventName, inline: false});
    }

    return  {
        title: '',
        description: message,
        color: 16711680,
        url: '',
        fields: embedFields,
    };

}

function DisplayEventTest(event, channelID)
{
    // Display a single event
    const embed = {
        title: event.name,
        description: event.date + ' - ' + event.author,
        url: event.infoUrl,
        color: 16711680,
        thumbnail: {
          url: "https://media.discordapp.net/attachments/614735374400487435/614874757195890698/Buckyball_Transparent.png?width=300&height=300"
        },
        image: {
          url: event.bannerImage
        }
    };     

    if (event.bannerImage)
    {
        bot.sendMessage({
            to: channelID,
            embed: embed
        });
        return;    
    }
    bot.sendMessage({
        to: channelID,
        message: event.name + "\n<" + event.infoUrl + ">"
    }); 
}

function DisplayEvent(event, channelID)
{
    // Display a single event
    if (event.bannerImage)
    {
        bot.sendMessage({
            to: channelID,
            embed: EventEmbed(event)
        });
        return;    
    }
    bot.sendMessage({
        to: channelID,
        message: event.name + "\n<" + event.infoUrl + ">"
    }); 
}

function DisplayEvents(events, channelID)
{
    // Display a number of events (passed as an array)

    if (events.length == 1)
    {
        console.log('Events found: 1');
        DisplayEvent(events[0], channelID);
        return;
    }

    if (events.length>3)
    {
        var eventInfo = '';
        if (events.length>maxResultsReturned)
        {
            console.log('Too many events');
            eventInfo = 'Only showing first ' + maxResultsReturned + ' results of ' + events.length;
            while (events.length > maxResultsReturned)
                events.pop();
            //events = events.splice(maxResultsReturned);
        }

        bot.sendMessage({
            to: channelID,
            embed: EventsEmbed(events, eventInfo)
        });
        return;     
    }
    else
    {
        console.log('Events found: ' + events.length);
        for (i=0; i<events.length; i++)
        {
            bot.sendMessage({
                to: channelID,
                embed: EventEmbed(events[i])
            });
            //eventInfo += events[i].name + "\n<" + events[i].infoUrl + ">\n"
        }
    }  
}

// FindRace function
function FindRace(raceName,channelID)
{
    // We are looking for an event called (or containing) raceName, and return the results

    var foundEvent = false;
    raceName = raceName.toLowerCase();
    var words = raceName.split(' ');
    
    if (events.length > 0)
    {
        // We need to read the race events from the past-events channels
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.extractedInfo)
            {
                console.log('Unable to read event information for event: ' + event.name);
            }
            else
            {
                if (words.length>1)
                {
                    var wordFound = true;
                    for (j=0; j<words.length; j++)
                    {
                        wordFound = event.name.toLowerCase().includes(words[j]);
                        if (!wordFound)
                        {
                            break;
                        }
                    }
                    if (wordFound)
                    {
                        matchingEvents.push(event);
                        foundEvent = true;
                    }
                }
                else
                {         
                    if (event.name.toLowerCase().includes(raceName))
                    {
                        matchingEvents.push(event);
                        foundEvent = true;
                    }
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }
    }

    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching criteria: ' + raceName
        });  
    }
}

function FindWordsInEventDescription(words,channelID)
{
    // Perform a word search (look for events that contain all of the passed words)

    var foundEvent = false;
    if (events.length > 0)
    {
        // We need to read the race events from the past-events channels
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.extractedInfo)
            {
                console.log('Unable to read event information for event: ' + event.name);
            }
            else
            {
                var wordFound = true;
                if (event.wordList)
                {
                    // We have a words list that we can use (should be much quicker than a string search)
                    //console.log("Using words list to perform search");
                    for (j=0; j<words.length; j++)
                    {
                        wordFound = event.wordList.includes(words[j]);
                        if (!wordFound)
                            break;
                    } 
                }
                else
                {
                    //console.log('Searching extracted data for text');
                    for (j=0; j<words.length; j++)
                    {
                        wordFound = event.extractedInfo.toLowerCase().includes(words[j]);
                        if (!wordFound)
                            break;
                    }
                }
                if (wordFound)
                {
                    matchingEvents.push(event);
                    foundEvent = true;
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }
    }
    
    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching criteria: with ' + location
        });  
    }    
}

// FindRaceAt/With function
function FindRaceAt(location,channelID)
{
    // We are looking for a race that occurred in the specified location.
    // We just do a dumb search on the forum content to find a match

    location = location.toLowerCase();
    var matchByPhrase = false;

    if (location.substring(0,1) == '"' && location.substring(location.length-1, location.length) == '"')
    {
        // Searching for "a quoted phrase"
        location = location.substring(1, location.length-1);
        matchByPhrase = true;
    }

    if (location.includes(' ') && !matchByPhrase)
    {
        FindWordsInEventDescription(location.split(' '), channelID);
        return;
    }

    var foundEvent = false;
    if (events.length > 0)
    {
        // We need to read the race events from the past-events channels
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.extractedInfo)
            {
                console.log('Unable to read event information for event: ' + event.name);
            }
            else
            {
                if (event.wordList && !matchByPhrase)
                {
                    if (event.wordList.includes(location))
                    {
                        matchingEvents.push(event);
                        foundEvent = true;
                    }
                }
                else if (event.extractedInfo.toLowerCase().includes(location))
                {
                    matchingEvents.push(event);
                    foundEvent = true;
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }
    }
    
    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching criteria: with ' + location
        });  
    }
}

// FindRaceIn function
function FindRaceIn(eventDate,channelID)
{
    // We are looking for a race that occurred during the specified date
    // We just do a dumb search on the forum content to find a match

    eventDate = eventDate.toLowerCase();

    var includeStandingChallenges = true;
    if (eventDate.length>5)
    {
        if (eventDate.substring(eventDate.length-5, eventDate.length) == ' only')
        {
            // Search excluding any standing challenges
            includeStandingChallenges = false;
            eventDate = eventDate.substring(0, eventDate.length-5);
        }
    }

    // Check for search month
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var searchMonth = -1;
    if (months.includes(eventDate.substring(0,3)))
    {
        // We are searching for a month
        searchMonth = months.indexOf(eventDate.substring(0,3));
    }
    if (eventDate == 'standing')
        searchMonth = 50; // Set to a month that cannot be found to just return the Standing Challenges

    // Check for search year - we'll use RegEx to extract any four digit number from our search string ^\d{4}$
    var searchYear = -1;
    var regEx = new RegExp('\\d{4}$');
    var yearMatches = eventDate.match(regEx);
    if (yearMatches)
    {
        if (yearMatches.length == 1)
            searchYear = Number(yearMatches[0]);
    }
    if (searchYear>-1 && searchYear<3000)
    {
        // The year has been passed in current day format.  Convert to E: D date
        // 2020 = 3306
        searchYear += 1286;
    }
    console.log('Search year: ' + searchYear);

    var foundEvent = false;
    if (events.length > 0)
    {
        // Loop through the events and find any that match
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.date)
            {
                console.log('Unable to read event date for event: ' + event.name);
            }
            else
            {
                if (event.date == 'Standing Challenge' || event.date == 'Now')
                {
                    if (includeStandingChallenges)
                    {
                        matchingEvents.push(event);
                        foundEvent = true;                    
                    }
                }
                else if (event.dateDate)
                {
                    var matchesMonth = (searchMonth==-1);
                    var matchesYear = (searchYear==-1);                    

                    var testDate = new Date(event.dateDate);

                    if (searchMonth>-1)
                    {
                        if (testDate.getMonth()==searchMonth)
                            matchesMonth = true;
                    }
                    if (searchYear>-1)
                    {
                        if (testDate.getFullYear()==searchYear)
                            matchesYear = true;
                    }


                    if (matchesMonth && matchesYear)
                    {
                        matchingEvents.push(event);
                        foundEvent = true;
                    }
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }        
    }
    
    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching date criteria: in ' + eventDate
        });  
    }
}

// FindRaceIn function
function FindRaceBy(author,channelID)
{
    // We are looking for a race created by the given author

    var foundEvent = false;
    author = author.toLowerCase();
    if (events.length > 0)
    {
        // Loop through the events and find any that match
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.date)
            {
                console.log('Unable to read event date for event: ' + event.name);
            }
            else
            {
                if (event.author)
                {
                    if (event.author.toLowerCase().includes(author))
                    {
                        matchingEvents.push(event);
                        //DisplayEvent(event, channelID);
                        foundEvent = true;
                    }
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }        
    }
    
    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching criteria: by ' + author
        });  
    }
}

function SendGIF(gifUrl, channelID, message = '')
{
    // Send GIF to channel as message attachment
    console.log(gifUrl);
    console.log(message);
    const gifEmbed = {
        title: '',
        description: '',
        image: {
            url: gifUrl,
        },
    };
    const msg = {
		type: 0,
		content: String(message),
		nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
		embed: gifEmbed,
        attachments: []
    };

    bot.sendMessage({
        to: channelID,
        message: ':khan: What are you doing?!',
    });    
}

function ShowGIF(gifUrl, channelID, message = '')
{
    // Send GIF to channel
    const gifEmbed = {
        title: '',
        description: '',
        image: {
            url: gifUrl,
        },
        footer: {text: message},
    };
    bot.sendMessage({
        to: channelID,
        message: '',
        embed: gifEmbed
    });        
}

function GetRandomQuote(context = '')
{
    var responses = randomResponses;
    if (context != '')
    {
        // We have some context, so let's see if we can get a better quote
        for (contextWord in themedResponses)
        {
            if (context.includes(contextWord))
            {
                responses = themedResponses[contextWord];
                break;
            }
        }
    }
    var quoteNum = Math.floor(Math.random() * (responses.length));
    return responses[quoteNum];
}

function InitEvents()
{
    // Initialise our events
    // If we have a saved file, we load from there

    var eventsData = fs.readFile(eventsDataFile, (err, data) => {
        if (err)
        {
            console.log('Error while restoring events from file: ' + err);
            ReadEvents();
        }
        else
        {
            events = JSON.parse(data);
            console.log('Restored ' + events.length + ' events from ' + eventsDataFile);
        }
    });
}

function InitPictures()
{
    // Initialise our events
    // If we have a saved file, we load from there

    var picData = fs.readFile(picDataFile, (err, data) => {
        if (err)
        {
            console.log('Error while restoring picture data from file: ' + err);
        }
        else
        {
            quickGifs = JSON.parse(data);
            console.log('Restored ' + quickGifs.length + ' pictures from ' + picDataFile);
        }
    });
}


// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function () {
    console.log('Connected');
    console.log('Logged in as: ' + bot.username + ' (' + bot.id + ')');
    InitEvents();
    InitPictures();
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`

    if ( user == 'BuckyBot')
    {
        // Don't respond to own messages
        return;
    }

    if (message.substring(0,1) != '!')
        return;
    loweredMessage = message.toLowerCase();
    console.log('Message received: ' + message);
    
    for (quickGIF in quickGifs)
    {
        if (loweredMessage.substring(1, quickGIF.length+1) == quickGIF)
        {
            if (loweredMessage.length>quickGIF.length+1)
            {
                // There is more to the message
                if (loweredMessage.substring(quickGIF.length+1,quickGIF.length+2) == ' ')
                {
                    // We have a message to show as well
                    console.log('Matched GIF: ' + quickGIF + ' (' + quickGifs[quickGIF] + ')');
                    ShowGIF(quickGifs[quickGIF], channelID, message.substring(quickGIF.length+2));
                    return;
                }
                // If we get here then this wasn't a GIF command, so we continue
            }
            else
            {
                console.log('Matched GIF: ' + quickGIF + ' (' + quickGifs[quickGIF] + ')');
                ShowGIF(quickGifs[quickGIF], channelID);
                return;
            }
        }
    }

    // Check for any of the names we respond to
    var commandLength = -1;
    for (var i=0; i<respondTo.length; i++)
    {
        if (loweredMessage.length > respondTo[i].length+1)
        {
            if (loweredMessage.substring(1,respondTo[i].length+1) == respondTo[i])
            {
                commandLength = respondTo[i].length;
                break;
            }
        }
    }

    if (commandLength<0)
        return;
    
    
    var args = loweredMessage.substring(commandLength+2).split(' ');

    var cmd = args[0];
    if (cmd === 'find')
    {
        cmd = 'findrace';
        if (args[1] === 'race')
            args.splice(1,1);
    }

    switch(cmd) {
        // !buckybot bucky
        case 'ping':
            bot.sendMessage({
                to: channelID,
                message: 'Awaiting your command - type !buckybot help for list.'
            });
            break;

        // buckybot help
        case 'help':
            var gifCmds = '';
            for (gifCmd in quickGifs)
                gifCmds += '!' + gifCmd + ', ';
            if (gifCmds != '')
                gifCmds = gifCmds.substring(0, gifCmds.length-2);
            bot.sendMessage({
                to: channelID,
                message:    '!buckybot events\n' +
                            '!buckybot random\n' +                                                  
                            '!buckybot find active\n' +
                            '!buckybot find <word or phrase in title>\n' +
                            '!buckybot find with <keywords> ("enclose in quotes to match entire phrase")\n' +
                            '!buckybot find in <month> <year> (at least one must be specified, months should be in English text)\n' +
                            '!buckybot find by <author>\n' +                          
                            '!buckybot refresh\n' +                          
                            gifCmds
            });
            break;

        // !buckybot findrace
        case 'findrace':
            var searchFor = '';
            if (args[1])
                searchFor = args.slice(2).join(' ');
            if ( (args[1] == 'at') || (args[1] == 'with') )
            {
                // !findrace at xxx triggers a search of the forum content (we assume that at is a place)
                FindRaceAt(searchFor,channelID);
            }
            else if (args[1] == 'in')
            {
                FindRaceIn(searchFor,channelID);
            }
            else if (args[1] == 'by')
            {
                FindRaceBy(searchFor,channelID);
            }
            else if (args[1] == 'active')
            {
                FindRaceIn('standing',channelID);
            }                         
            else
            {
                var searchFor = args.slice(1).join(' ');
                FindRace(searchFor,channelID);
            }
            break;

        case 'events':
            // Inform how many events the bot knows about
            bot.sendMessage({
                to: channelID,
                message: 'I know about ' + events.length + ' events'
            });      
            break;

        case 'test':
            if (events)
            {
                if (events.length > 0)
                {
                    var eventNum = Math.floor(Math.random() * (events.length));
                    DisplayEventTest(events[eventNum], channelID);
                }
            }
            //SendGIF(quickGifs['khan'], channelID, 'Some message');
            break;

        case 'readevents':
        case 'refresh':
            // Read the events from past events channels
            readEventsReportChannel = channelID;
            ReadStandingChallenges();
            ReadEvents();
            break;

        case 'randomevent':
        case 'random':
            // Display a random event
            if (events)
            {
                if (events.length > 0)
                {
                    var eventNum = Math.floor(Math.random() * (events.length));
                    DisplayEvent(events[eventNum], channelID);
                }
            }
            break;

        case 'setpic':
            // addpic name url
            if (args.length==3)
            {
                var picUrlPos = loweredMessage.indexOf(args[1])+args[1].length+1;
                var picUrl = message.substring(picUrlPos);
                console.log('Updating picture: ' + args[1] + ' = ' + picUrl)
                quickGifs[args[1]] = picUrl;
            }
            fs.writeFile(picDataFile, JSON.stringify(quickGifs), (err) => {
                if (err)
                {
                    console.log('Failed to write pictures: ' + err);
                }
                else
                    console.log('Pictures saved to: ' + picDataFile);
            });            
            break;

        default:
            // Check for GIF
            for (quickGIF in quickGifs)
            {
                if (cmd == quickGIF)
                {
                    console.log('Matched GIF: ' + quickGIF + ' (' + quickGifs[quickGIF] + ')');
                    var gifMessage = '';
                    if (args[1])
                        gifMessage = message.substring(commandLength + quickGIF.length+2);                    

                    ShowGIF(quickGifs[quickGIF], channelID, gifMessage);
                    return;
                }
            } 
            
            // No GIF, so send random phrase
            var response = 'You could at least say something';
            if (args[0] != '')
                response = GetRandomQuote(args.join(' '));
            bot.sendMessage({
                to: channelID,
                message: response
            }); 
            break;
        }
});

bot.on('disconnect', function() {
    console.log('Disconnected');
});