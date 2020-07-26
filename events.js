const fetch = require('node-fetch');
const fs = require('fs');
const htmlparser2 = require("htmlparser2");

function EmptyEvent()
{
    return {
        name: '',
        description: '',
        author: '',
        startDate: Date(0),
        endDate: Date(),
        dateDescription: '', // 'Standing Challenge'
        infoUrl: '',
        bannerImage: '',
        extractedInfo: '',
        wordList: null
    };/*    
    this.name = '';
    this.description = '';
    this.author = '';
    this.startDate = Date(0);
    this.endDate = Date();
    this.dateDescription = '';
    this.infoUrl = '';
    this.bannerImage = '';
    this.extractedInfo = '';
    this.wordList = null;*/
}

module.exports = {

    saveFile: '',
    events: [],

    log: function(message)
    {
        // We just do a console.log, but we've wrapped it in case we want to change it in future
        console.log(message);
    },

    SaveToFile: function(filename)
    {
        // Write the event list to file
        if (filename == '')
        {
            if (this.saveFile == '')
            {
                this.log('No file specified on SaveToFile');
                return;
            }
            filename = this.saveFile;
        }
        fs.writeFile(filename, JSON.stringify(this.events), (err) => {
            if (err)
            {
                this.log('Failed to write events to ' + filename + ': ' + err);
            }
            else
                this.log('Events data saved to: ' + filename);
                this.saveFile = filename;
        });    
    },

    RestoreFromFile: function(filename)
    {
        // Restore event data from the given file
        var eventsData = fs.readFile(filename, (err, data) => {
            if (err)
            {
                this.log('Error while restoring events from ' + filename + ': ' + err);
                this.ReadEvents();
            }
            else
            {
                this.events = JSON.parse(data);
                this.log('Restored ' + events.length + ' events from ' + filename);
                this.saveFile = filename;
            }
        });    
    },

    Add: function(addEvent, forceUpdate = false)
    {
        // Adds the event to our event list

        this.events.push(addEvent);
        var addedEventId = events.length;

        // For new events, we check if we have extracted info
        if (!addEvent.extractedInfo || addEvent.extractedInfo == '' || forceUpdate)
        {
            // We haven't got the information about this event yet
            if (addEvent.infoUrl)
            {
                this.GetRaceInfoFromForums(addEvent.infoUrl, addedEventId)
            }
        }
    },

    CreateWordsList: function(sourceText)
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
    },

    ExtractFirstPostFromThread: function(threadHTML, eventId)
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
                                this.events[eventId].extractedInfo = extractedData;
                                this.events[eventId].wordList = this.CreateWordsList(extractedData);
                                this.events[eventId].author = author;
                            }
                        }
                    }
                    else if (name === 'a')
                    {
                        collectAuthor = false;
                    }
                },
                onend() {
                    this.DecrementEventsWaitingUpdate();
                }
            },
            { decodeEntities: true }
        );
        parser.write(threadHTML);
        parser.end();
    },

    getRaceInfoFromForums: function(forumUrl, eventId) {
        // Retrieve the first post from the forum thread provided and store it with the event information so that
        // the contents can be searched.
        // e.g. https://forums.frontier.co.uk/threads/the-lavecon-2020-buckyball-race-3rd-5th-july-2020.549727/

        this.events[eventId].extractedInfo = 'No data';
        if (!forumUrl)
        {
            this. DecrementEventsWaitingUpdate();
            this.log('No forum Url passed');
            return;
        }
        if (!forumUrl.substring(0,30) == 'https://forums.frontier.co.uk/')
        {      
            this.DecrementEventsWaitingUpdate();
            this.log('Invalid forum Url detected: ' + forumUrl);
            return;
        }
    
        // Retrieve the data from the link, then update the appropriate event
        this.log('Retrieving event information from: ' + forumUrl);
        fetch(forumUrl)
            .then(res => res.text(), reason => { this.DecrementEventsWaitingUpdate();})
            .then((text) => {
                if (text)
                    this.events[eventId].extractedInfo = text;     
                this.ExtractFirstPostFromThread(text, eventId);
            }, reason => { this.DecrementEventsWaitingUpdate();});
    },

    DecrementEventsWaitingUpdate: function(callbackOnceDone = null)
    {
        // Decrement our events waiting for update counter, and when it hits zero, save it to disk
        
        if (this.eventsWaitingUpdate<0) { return; }

        this.eventsWaitingUpdate--;
        if (this.eventsWaitingUpdate < 0)
        {
            this.log('No more events waiting update');
            this.SaveToFile();
            if (callbackOnceDone)
            {
                callbackOnceDone();
            }
        }
    },

    ExtractStandingChallenges: function(html)
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
                                    event = EmptyEvent();
                                    inEventTitle = true;
                                    if (inNextRace)
                                        event.dateDescription = 'Now';
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
                                        if (!this.events) this.events = [];
                                        this.events.push(event);
                                        this.getRaceInfoFromForums(event.infoUrl,this.events.length-1);
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
    },

    ReadStandingChallenges: function()
    {
        // Read standing challenges from the Buckyball website (http://buckyballracing.org.uk/)

        if (!this.events) this.events = [];

        // Retrieve the data from the link, then update the appropriate event
        console.log('Retrieving standing challenges from information from http://buckyballracing.org.uk/');
        fetch('http://buckyballracing.org.uk/')
            .then(res => res.text(), reason => { })
            .then((text) => {
                this.ExtractStandingChallenges(text);
            }, reason => { });  
    },

    // ParseEvent function
    ParseDiscordEvent: function(eventInfo)
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
    },

    ReadPastEvents: function()
    {
        // http://buckyballracing.org.uk/pastevents.html
        // 
        // Retrieve the data from the link, then update the appropriate event
        console.log('Retrieving standing challenges from information from http://buckyballracing.org.uk/pastevents.html');
        fetch('http://buckyballracing.org.uk/')
            .then(res => res.text(), reason => { })
            .then((text) => {
                this.ExtractChallengesFromBuckyballPage(text);
            }, reason => { });  
    },

    // ReadEvents function
    ReadEvents: function()
    {
        // We need to read the race events from the past-events channels

        this.ReadStandingChallenges();
        //ReadPastEvents();
    },

    GetMatchingEvents: function(comparisonCallback)
    {
        // An iterator for our events where we pass each event to a callback to see if it matches

        var matchingEvents = [];

        if (events.length > 0)
        {
            // We need to read the race events from the past-events channels
            for (i=0; i<events.length; i++)
            {
                if (comparisonCallback(events[i]))
                    matchingEvents.push(events[i]);
            }
        }
        return matchingEvents;
    },

    FindEventsAfter: function(date)
    {
        return this.GetMatchingEvents(function(event){
            return (event.StartDate > date);
        });
    },

    FindEventsBefore: function(date)
    {
        return this.GetMatchingEvents(function(event){
            return (event.StartDate < date);
        });
    },

    FindActiveEvents: function()
    {
        return this.GetMatchingEvents(function(event){
            return (event.StartDate < Date.now() && event.EndDate > Date.now() );
        });
    },

    FindEventsByKeywords: function(words)
    {
        return this.GetMatchingEvents(function(event){
            for (i=0; i<words.length; i++)
            {
                if ( !event.wordList.includes(words[i]) ) return false;
            } 
            return true;
        });   
    },

    FindEventsByPhrase: function(phrase)
    {
        return this.GetMatchingEvents(function(event){
            return event.extractedInfo.toLowerCase().includes(phrase);
        });   
    },

    FindEventsByTitle: function(phrase)
    {
        var words = phrase.toLowerCase().split(' ');
        return this.GetMatchingEvents(function(event){
            for (i=0; i<words.length; i++)
            {
                if (!event.name.toLowerCase().includes(words[i])) return false;
            }
            return true;
        });  
    },

    FindRaceByAuthor: function(author)
    {
        return this.GetMatchingEvents(function(event){
            return event.author.toLowerCase().includes(author);
        });     
    }

};