In the production graphiql interface I am running these queries

query Authenticate($username: String!, $password: String!) {
  authenticate {
    username_and_password(username: $username, password: $password) {
      token
    }
  }
}

query GetDiamondsCount($token: String!, $query: DiamondQuery!, $order: DiamondOrder) {
  as(token: $token) {
    diamonds_by_query_count(query: $query, order:$order)
  }
}

query DiamondsByQuery($token: String!, $query: DiamondQuery!, $offset: Int, $limit: Int, $order: DiamondOrder) {
  as(token: $token) {
    diamonds_by_query(query: $query, offset: $offset, limit: $limit, order: $order) {
      total_count
    }
  }
}


In the query variables I have this set

{
  "username": "",
  "password":"",
  "token": "",
  "offset": 36400,
  "limit": 40,
  "query": {
    "has_image": true,
    "has_v360": true,
    "availability": [
      "AVAILABLE"
    ],
    "excludeFairPoorCuts": true,
    "hide_memo": true,
    "dollar_per_carat": {
      "from": 180,
      "to": 209
    },
    "sizes": {
      "from": 0.4,
      "to": 15.01
    },
    "labgrown": true,
    "shapes": [
      "ROUND",
      "OVAL",
      "EMERALD",
      "CUSHION",
      "CUSHION B",
      "CUSHION MODIFIED",
      "CUSHION BRILLIANT",
      "ASSCHER",
      "RADIANT",
      "MARQUISE",
      "PEAR",
      "PRINCESS",
      "ROSE",
      "OLD MINER",
      "TRILLIANT",
      "HEXAGONAL",
      "HEART"
    ]
  },
  "order": {
    "type": "createdAt",
    "direction": "ASC"
  }
}


The GetDiamondsCount returns

{
  "data": {
    "as": {
      "diamonds_by_query_count": 36413
    }
  }
}

The DiamondsByQuery returns

{
  "data": {
    "as": {
      "diamonds_by_query": {
        "total_count": 13
      }
    }
  }
}

Which is what I expect based on the offset. I cannot use the total count value from the DiamondsByQuery as that simple returns the total count of records in that query response, not the total across the range.

Therefore, the issue has to be inside our worker?

{
  "feed": "nivoda-labgrown",
  "type": "WORK_ITEM",
  "limit": 40,
  "runId": "a9552dcb-9e12-4ec7-bce3-813939ff55a8",
  "offset": 0,
  "traceId": "64a3ded0-1f66-41ff-97fc-fbaee5ac3e91",
  "maxPrice": 209,
  "minPrice": 180,
  "updatedTo": "2026-02-26T20:39:47.147Z",
  "partitionId": "partition-15",
  "updatedFrom": "2000-01-01T00:00:00.000Z",
  "estimatedRecords": 35040
}

# New Notes

Data inside the worker_runs in production - example partition that failed

{
  "feed": "nivoda-labgrown",
  "type": "WORK_ITEM",
  "limit": 40,
  "runId": "a9552dcb-9e12-4ec7-bce3-813939ff55a8",
  "offset": 0,
  "traceId": "64a3ded0-1f66-41ff-97fc-fbaee5ac3e91",
  "maxPrice": 209,
  "minPrice": 180,
  "updatedTo": "2026-02-26T20:39:47.147Z",
  "partitionId": "partition-15",
  "updatedFrom": "2000-01-01T00:00:00.000Z",
  "estimatedRecords": 35040
}

Partition Details for the above work_item

  {
    "idx": 0,
    "run_id": "a9552dcb-9e12-4ec7-bce3-813939ff55a8",
    "partition_id": "partition-15",
    "next_offset": 35,
    "completed": true,
    "created_at": "2026-02-26 20:41:06.902719+00",
    "updated_at": "2026-02-26 20:41:33.435356+00",
    "failed": false
  }

